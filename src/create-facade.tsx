import React from "react";
import invariant from "invariant";

type AnyFunc = Function | ((...args: any[]) => any);

type BasicFacadeInterface = { [hookName: string]: Function | BasicFacadeInterface };

/**
 * This type is used to filter out non-functions and objects from the interface.
 */
// prettier-ignore
type AllObjectAndFunctionKeys<T> = {
  [K in keyof T]: 
    T[K] extends AnyFunc ? K :
    T[K] extends object ? K :
    never
}[keyof T];

/**
 * This type recurses down through the interface and filters out non-functions and objects.
 * `AllObjectAndFunctionKeys` is doing the heavy lifting here because the keys are defacto
 * removed from the interface.
 */
// prettier-ignore
type FilterNonFuncs<T> = {
  [P in AllObjectAndFunctionKeys<T>]:
    T[P] extends AnyFunc ? T[P] :
    T[P] extends object ? Readonly<FilterNonFuncs<T[P]>> :
    never;
};

export type ImplementationProvider<T> = React.ComponentType<React.PropsWithChildren<{ implementation: T }>> & {
  __UNSAFE_Partial: React.ComponentType<React.PropsWithChildren<{ implementation: Partial<T> }>>;
};

type Options = { displayName: string; strict: boolean };

/**
 * This function interface is present so that when a "BasicFacadeInterface" is provided,
 * the resulting hook object will be typed as `Readonly<T>` which is much easier to read
 * than FilterNonFuncs<T>. That is, if you provide an interface without keys that need to be
 * filtered out, the resulting hook object will be typed as the much more readable `Readonly<T>`.
 */
export function createFacade<T extends BasicFacadeInterface>(
  options?: Partial<Options>
): [Readonly<T>, ImplementationProvider<T>];

/**
 * When an interface is provided for `T`, for example `interface A { ... }`,
 * and/or _any_ of the keys in `T` are not functions or objects, we fallback to this
 * which uses `FilterNonFuncs` to filter out non-hooks. It's a little harder to read than
 * the above, but without it we could not support interfaces.
 */
export function createFacade<T extends object>(
  options?: Partial<Options>
): [Readonly<FilterNonFuncs<T>>, ImplementationProvider<FilterNonFuncs<T>>];

/**
 * If we don't provide a `T`, then fallback to an empty interface.
 * You might be missing the point, if you fell into this function signature.
 */
export function createFacade(options: Partial<Options> = {}): [Readonly<{}>, ImplementationProvider<{}>] {
  type T = BasicFacadeInterface;

  const displayName = options.displayName ?? "Facade";
  const strict = options.strict ?? true;
  const providerNotFound = Symbol();

  const Context = React.createContext<T | typeof providerNotFound>(providerNotFound);
  Context.displayName = `ImplementationProviderContext(${displayName})`;

  const createRecursiveProxy = <U,>(keyPath: string[]) => {
    const keyCache = {} as { [K in keyof U]: U[K] };

    /**
     * Use a function as the `target` so that the proxy object is callable.
     */
    return new Proxy(function () {}, {
      apply(_target: any, _thisArg: any, args: any[]) {
        const concrete = React.useContext(Context);

        React.useDebugValue(keyPath);

        invariant(
          concrete !== providerNotFound,
          `Component using "${keyPath.join(".")}" must be wrapped in provider ${Context.displayName}`
        );

        let target: any = concrete;
        let thisArg: any = undefined;

        const currentPath = [];

        for (const key of keyPath) {
          currentPath.push(key);
          thisArg = target;
          target = target[key];

          invariant(
            target !== undefined,
            `${Context.displayName} does not provide a hook named "${currentPath.join(".")}"`
          );
        }

        invariant(
          typeof target === "function",
          `${Context.displayName} provides a value "${currentPath.join(".")}" but it is not a function.`
        );

        return target.apply(thisArg, args);
      },
      get(_target: any, key0: string): any {
        const key = key0 as keyof U & string;

        if (key in keyCache) {
          return keyCache[key];
        }

        const next = createRecursiveProxy([...keyPath, key]);

        keyCache[key] = next;

        return next;
      },
      has() {
        return false;
      },
      ownKeys() {
        return [];
      },
      getOwnPropertyDescriptor() {
        return undefined;
      },
      getPrototypeOf() {
        return null;
      },
      preventExtensions() {
        return true;
      },
      isExtensible() {
        return false;
      },
      set() {
        return false;
      },
      deleteProperty() {
        return false;
      },
    });
  };

  const ImplementationProvider: ImplementationProvider<T> = (props) => {
    const parent = React.useContext(Context);

    invariant(
      parent === providerNotFound,
      `${ImplementationProvider.displayName} should not be rendered inside of another ${ImplementationProvider.displayName}.`
    );

    const implementationRef = React.useRef<T>(props.implementation);

    invariant(
      !strict || implementationRef.current === props.implementation,
      `${Context.displayName} unexpectedly received a new implementation. This is not allowed in strict mode. To disable this error use the option "strict: false".`
    );

    return <Context.Provider value={props.implementation}>{props.children}</Context.Provider>;
  };
  ImplementationProvider.displayName = `ImplementationProvider(${displayName})`;

  /**
   * Used to create a partial context to reduce setup tedium in test scenarios.
   */
  ImplementationProvider.__UNSAFE_Partial = (props) => (
    <ImplementationProvider implementation={props.implementation as any}>{props.children}</ImplementationProvider>
  );
  ImplementationProvider.__UNSAFE_Partial.displayName = `ImplementationProvider.__UNSAFE_Partial(${displayName})`;

  return [createRecursiveProxy<T>([]), ImplementationProvider];
}
