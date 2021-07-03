import React from "react";
import invariant from "invariant";
import { Facade, FacadeInterface } from "./types";

export function createFacade<T extends FacadeInterface>(displayName?: string): Facade<T> {
  const providerNotFound = Symbol();

  const Context = React.createContext<T | typeof providerNotFound>(providerNotFound);
  Context.displayName = displayName ? `ImplementationProvider(${displayName})` : "ImplementationProvider";

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
        const ctx = React.useContext(Context);

        invariant(ctx !== providerNotFound, `Component using "${property}" must be wrapped in provider ${displayName}`);
        invariant(property in ctx, `${displayName} does not provide a hook named "${property}"`);

        return ctx[property](...args);
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

  type ImplementationProviderProps = React.PropsWithChildren<{
    implementation: T;
  }>;

  const ImplementationProvider = (props: ImplementationProviderProps) => {
    /**
     * TODO: enforce the same keys on every render of this component
     */
    for (const key in props.implementation) {
      if (props.implementation.hasOwnProperty(key)) {
        const type = typeof props.implementation[key];
        invariant(
          type === "function",
          `ImplementationProvider expected "${key}" to be a function but it was a ${type}`
        );
      }
    }

    return <Context.Provider value={props.implementation}>{props.children}</Context.Provider>;
  };

  type PartialImplementationProviderProps = React.PropsWithChildren<{
    implementation: Partial<T>;
  }>;

  ImplementationProvider.Partial = (props: PartialImplementationProviderProps) => {
    return (
      <ImplementationProvider implementation={props.implementation as any}>{props.children}</ImplementationProvider>
    );
  };

  return [hooks, ImplementationProvider];
}
