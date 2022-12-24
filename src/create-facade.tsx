import React from "react";
import invariant from "invariant";

type AnyFunc = (...args: any[]) => any;

type BasicFacadeInterface = { [hookName: string]: AnyFunc | BasicFacadeInterface };

type FilterNonFuncs<T> = {
  [K in keyof T]: T[K] extends AnyFunc ? T[K] : T[K] extends object ? FilterNonFuncs<T[K]> : undefined;
};

type ImplementationProvider<T> = React.ComponentType<React.PropsWithChildren<{ implementation: T }>> & {
  __UNSAFE_Partial: React.ComponentType<React.PropsWithChildren<{ implementation: Partial<T> }>>;
};

type Options = { displayName: string; strict: boolean };

/**
 * This function interface is present so that when a "BasicFacadeInterface" is provided,
 * the resulting hook object will be typed as `Readonly<T>` which is much easier to read
 * than something with `Pick` (see below).
 */
export function createFacade<T extends BasicFacadeInterface>(
  options?: Partial<Options>
): [Readonly<T>, ImplementationProvider<T>];

/**
 * When an interface is provided for `T`, for example `interface A { ... }`,
 * and/or _any_ of the keys in `T` are not functions, we fallback to this interface
 * which uses `Pick` to filter out non-hooks. It's a little harder to read than
 * the above, but without it we could not support interfaces.
 *
 * TODO: Is there a way to constrain an interface without this? That is, is there
 * something we could extend `T` off of so that any interface provided has only
 * functions as values? `T extends BasicFacadeInterface` does not work.
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

  const createRecursiveProxy = (keyPath: string[]) => {
    const keyCache = {} as { [key: string]: any };

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
      get(_target: any, key: string): any {
        if (key in keyCache) {
          return keyCache[key];
        }

        const hook = createRecursiveProxy([...keyPath, key]);

        keyCache[key] = hook;

        return hook;
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

  return [createRecursiveProxy([]), ImplementationProvider];
}
