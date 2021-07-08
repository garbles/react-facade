import React from "react";
import invariant from "invariant";

/**
 * Force `this` to not be used
 */
type FacadeInterface = { [hookName: string]: (this: void, ...args: any[]) => any };

type ImplementationProvider<T extends FacadeInterface> = React.ComponentType<{
  implementation: T;
  tag?: string;
}> & {
  __UNSAFE_Partial: React.ComponentType<{ implementation: Partial<T> }>;
  Override: React.ComponentType<{ implementation: Partial<T>; tag: string }>;
};

export function createFacade<T extends FacadeInterface>(
  displayName: string = "Facade"
): [T, ImplementationProvider<T>] {
  type TaggedImplementation = { [K in keyof T]: { use: T[K]; tags: string[] } };
  type ContextValue = { implementation: TaggedImplementation };

  const providerNotFound = Symbol();

  const Context = React.createContext<ContextValue | typeof providerNotFound>(providerNotFound);
  Context.displayName = `ImplementationProviderContext(${displayName})`;

  /**
   * Keep track of wrapped components as they are called so that they are never recreated.
   */
  const cache = {} as T;

  const hooks: T = new Proxy<T>({} as any, {
    get<K extends keyof T & string>(_target: T, property: K): T[K] {
      if (property in cache) {
        return cache[property];
      }

      /**
       * This has to be done so that `hooks` can be destructured outside of a functional component.
       * Is there a better way to do this?
       */
      const wrapper = (...args: any[]) => {
        const parent = React.useContext(Context);

        invariant(
          parent !== providerNotFound,
          `Component using "${property}" must be wrapped in provider ${Context.displayName}`
        );

        invariant(
          property in parent.implementation,
          `${Context.displayName} does not provide a hook named "${property}"`
        );

        const implementation = parent.implementation[property];

        /**
         * Display which tagged Providers have been used to define an implementation of this property
         */
        React.useDebugValue(`"${property}" implemented by ${JSON.stringify(implementation.tags)}`);

        return implementation.use(...args);
      };
      const cast = wrapper as T[K];

      /**
       * Do this to preserve the name of the wrapped function.
       */
      Object.defineProperty(cast, "name", { value: property, writable: false });
      Object.freeze(cast);

      cache[property] = cast;

      return cast;
    },
  });

  const ImplementationProvider: ImplementationProvider<T> = (props) => {
    const tag = props.tag ?? "root";
    const parent = React.useContext(Context);

    /**
     * Prevent the root ImplementationProvider from being nested inside of
     * another ImplementationProvider.
     */
    invariant(
      parent === providerNotFound,
      `${ImplementationProvider.displayName} should not be rendered inside of another ${ImplementationProvider.displayName}. To partially override the implementation, use ${ImplementationProvider.Override.displayName}`
    );

    const implementation = React.useMemo(() => {
      const result = {} as TaggedImplementation;

      /**
       * TODO: enforce the same keys on every render of this component
       */
      for (const key in props.implementation) {
        const use = props.implementation[key];

        invariant(
          typeof use === "function",
          `${ImplementationProvider.displayName} expected "${key}" to be a function but it was a ${typeof use}`
        );

        result[key] = { use, tags: [tag] };
      }

      return result;
    }, [props.implementation]);

    return <Context.Provider value={{ implementation }}>{props.children}</Context.Provider>;
  };
  ImplementationProvider.displayName = `ImplementationProvider(${displayName})`;

  /**
   * Used to partially override the implementation of of the parent ImplementationProvider
   */
  ImplementationProvider.Override = (props) => {
    const parent = React.useContext(Context);

    invariant(
      parent !== providerNotFound,
      `${ImplementationProvider.Override.displayName} should be wrapped in ${ImplementationProvider.displayName}`
    );

    const implementation = { ...parent.implementation };

    for (const key in props.implementation) {
      const use = props.implementation[key]!;

      invariant(
        typeof use === "function",
        `${ImplementationProvider.Override.displayName} expected "${key}" to be a function but it was a ${typeof use}`
      );

      /**
       * Ensure that this is already implemented.
       */
      invariant(
        implementation.hasOwnProperty(key),
        `${ImplementationProvider.Override.displayName} (tag="${props.tag}") has added "${key}" which was not previously on ${ImplementationProvider.displayName}`
      );

      /**
       * Append the tag to the list of tags to help with debugging.
       */
      const tags = [...implementation[key].tags, props.tag];
      implementation[key] = { use, tags };
    }

    return <Context.Provider value={{ implementation }}>{props.children}</Context.Provider>;
  };
  ImplementationProvider.Override.displayName = `ImplementationProvider.Override(${displayName})`;

  /**
   * Used to create a partial context to reduce setup tedium in test scenarios.
   */
  ImplementationProvider.__UNSAFE_Partial = (props) => {
    return (
      <ImplementationProvider implementation={props.implementation as any}>{props.children}</ImplementationProvider>
    );
  };
  ImplementationProvider.__UNSAFE_Partial.displayName = "ImplementationProvider.__UNSAFE_Partial";

  return [hooks, ImplementationProvider];
}
