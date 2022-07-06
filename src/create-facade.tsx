import React from "react";
import invariant from "invariant";

type AnyFunc = (...args: any[]) => any;

type BasicFacadeInterface = { [hookName: string]: AnyFunc };

type FilterNonFuncs<T> = Pick<T, { [K in keyof T]: T[K] extends AnyFunc ? K : never }[keyof T]> & {};

type ImplementationProvider<T> = React.ComponentType<React.PropsWithChildren<{ implementation: T }>> & {
  __UNSAFE_Partial: React.ComponentType<React.PropsWithChildren<{ implementation: Partial<T> }>>;
};

const isBrowser = typeof window !== "undefined" && !!window.document?.createElement;
const useSafeEffect = isBrowser ? React.useLayoutEffect : React.useEffect;

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

  const Context = React.createContext<BasicFacadeInterface | typeof providerNotFound>(providerNotFound);
  Context.displayName = `ImplementationProviderContext(${displayName})`;

  /**
   * Keep track of wrapped hooks as they are called so that they always have
   * the same reference. The hook doesn't close over the concrete implementation
   * (because it relies on injecting through context) so it's safe to cache by name.
   */
  const hookCache = {} as T;

  const hooks = new Proxy({} as T, {
    get<K extends keyof T & string>(_target: T, key: K): T[K] {
      if (key in hookCache) {
        return hookCache[key];
      }

      const hook = (...args: Parameters<T[K]>): ReturnType<T[K]> => {
        const concrete = React.useContext(Context);

        React.useDebugValue(key);

        invariant(
          concrete !== providerNotFound,
          `Component using "${key}" must be wrapped in provider ${Context.displayName}`
        );

        return concrete[key](...args);
      };

      /**
       * Do this to preserve the name of the wrapped function.
       */
      Object.defineProperty(hook, "name", { value: key, writable: false });

      hookCache[key] = hook;

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

  const ImplementationProvider: ImplementationProvider<T> = (props) => {
    const parent = React.useContext(Context);

    /**
     * Prevent the root ImplementationProvider from being nested inside of
     * another ImplementationProvider.
     */
    invariant(
      parent === providerNotFound,
      `${ImplementationProvider.displayName} should not be rendered inside of another ${ImplementationProvider.displayName}.`
    );

    const [implementation, setImplementation] = React.useState<T>(props.implementation);

    useSafeEffect(() => {
      invariant(
        !strict || implementation === props.implementation,
        `${Context.displayName} unexpectedly received a new implementation. This is not allowed in strict mode. To disable this error use the option "strict: false".`
      );

      setImplementation(props.implementation);
    }, [props.implementation]);

    const proxy = React.useMemo(() => {
      return new Proxy({} as T, {
        get<K extends keyof T & string>(_target: {}, key: K): T[K] {
          const concrete = implementation[key];

          invariant(concrete !== undefined, `${Context.displayName} does not provide a hook named "${key}"`);
          invariant(typeof concrete === "function", `Expected "${key}" to be a function but wasn't`);

          return concrete;
        },
        has(_target: {}, key: string) {
          return Reflect.has(implementation, key);
        },
        ownKeys(_target: {}) {
          return Reflect.ownKeys(implementation);
        },
        getOwnPropertyDescriptor(_target: {}, key: string) {
          return Reflect.getOwnPropertyDescriptor(implementation, key);
        },
        getPrototypeOf() {
          return Reflect.getPrototypeOf(implementation);
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
    }, [implementation]);

    return <Context.Provider value={proxy}>{props.children}</Context.Provider>;
  };
  ImplementationProvider.displayName = `ImplementationProvider(${displayName})`;

  /**
   * Used to create a partial context to reduce setup tedium in test scenarios.
   */
  ImplementationProvider.__UNSAFE_Partial = (props) => {
    return (
      <ImplementationProvider implementation={props.implementation as any}>{props.children}</ImplementationProvider>
    );
  };
  ImplementationProvider.__UNSAFE_Partial.displayName = `ImplementationProvider.__UNSAFE_Partial(${displayName})`;

  return [hooks, ImplementationProvider];
}
