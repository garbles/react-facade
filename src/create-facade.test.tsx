import { test, describe, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import React from "react";
import { createFacade, ImplementationProvider } from "./create-facade";

const createWrapper =
  <I extends object>(impl: I, Provider: ImplementationProvider<I>) =>
  (props) => {
    return <Provider implementation={impl}>{props.children}</Provider>;
  };

test("creates an implementation", () => {
  type IFace = {
    useAString(): string;
    useANumber(): number;

    nested: {
      useABoolean(): boolean;
    };
  };

  const impl = {
    useAString() {
      return "some string";
    },

    useANumber() {
      return 123;
    },

    nested: {
      useABoolean() {
        return true;
      },
    },
  };

  const [hooks, Provider] = createFacade<IFace>();
  const wrapper = createWrapper(impl, Provider);

  const { result: resultA } = renderHook(() => hooks.useAString(), { wrapper });
  const { result: resultB } = renderHook(() => hooks.useANumber(), { wrapper });
  const { result: resultC } = renderHook(() => hooks.nested.useABoolean(), { wrapper });

  expect(resultA.current).toEqual("some string");
  expect(resultB.current).toEqual(123);
  expect(resultC.current).toEqual(true);
});

test("implementations can use other hooks", () => {
  vi.useFakeTimers();

  type IFace = {
    useCounter(interval: number): number;
  };

  const impl: IFace = {
    useCounter(interval: number) {
      const [count, increment] = React.useReducer((count) => count + 1, 0);

      React.useEffect(() => {
        const intervalId = setInterval(increment, interval);
        return () => clearInterval(intervalId);
      }, [interval, increment]);

      return count;
    },
  };

  const [hooks, Provider] = createFacade<IFace>();
  const wrapper = createWrapper(impl, Provider);

  const { result } = renderHook(() => hooks.useCounter(1000), { wrapper });

  expect(result.current).toEqual(0);

  act(() => {
    vi.advanceTimersByTime(3000);
  });

  expect(result.current).toEqual(3);
});

describe("using other contexts", () => {
  type IFace = {
    useAString(): string;
  };

  const [hooks, Provider] = createFacade<IFace>();
  const SomeStringContext = React.createContext("some string");

  const impl: IFace = {
    useAString() {
      return React.useContext(SomeStringContext);
    },
  };

  const wrapper = createWrapper(impl, Provider);

  test("implementations can use other contexts", () => {
    const { result } = renderHook(() => hooks.useAString(), { wrapper });

    expect(result.current).toEqual("some string");
  });

  test("the order of the context does not matter as long as the implementation is called inside both.", () => {
    const wrapperWithContextOutside = (props: any) => {
      return <SomeStringContext.Provider value="some other string">{wrapper(props)}</SomeStringContext.Provider>;
    };

    const { result: resultA } = renderHook(() => hooks.useAString(), { wrapper: wrapperWithContextOutside });

    expect(resultA.current).toEqual("some other string");

    const wrapperWithContextInside = (props: any) => {
      return wrapper({
        children: <SomeStringContext.Provider value="yet another string">{props.children}</SomeStringContext.Provider>,
      });
    };

    const { result: resultB } = renderHook(() => hooks.useAString(), { wrapper: wrapperWithContextInside });

    expect(resultB.current).toEqual("yet another string");
  });

  test("using the wrapper option", () => {
    const WrapperWithContextOutside = (props: any) => {
      return <SomeStringContext.Provider value="some other string">{props.children}</SomeStringContext.Provider>;
    };

    const [hooks, Provider] = createFacade<IFace>({ wrapper: WrapperWithContextOutside });
    const SomeStringContext = React.createContext("some string");

    const impl: IFace = {
      useAString() {
        return React.useContext(SomeStringContext);
      },
    };

    const wrapper = createWrapper(impl, Provider);

    const { result: resultA } = renderHook(() => hooks.useAString(), { wrapper });

    expect(resultA.current).toEqual("some other string");
  });
});

test("destructuring always returns the same reference", () => {
  type IFace = {
    useCurrentUser(): { id: string; name: string };
    nested: {
      useANestedValue(): string;
    };
  };

  const [hooks] = createFacade<IFace>();

  expect(hooks.useCurrentUser).toBe(hooks.useCurrentUser);
  expect(hooks.nested.useANestedValue).toBe(hooks.nested.useANestedValue);
});

describe("errors", () => {
  let error: typeof console.error;

  beforeEach(() => {
    error = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = error;
  });

  test("throws an error when provider is not used", () => {
    type IFace = {
      useCurrentUser(): { id: string; name: string };
    };

    const [hooks] = createFacade<IFace>({ displayName: "Oopsie" });

    expect(() => renderHook(() => hooks.useCurrentUser())).toThrowError(
      new Error('Component using "useCurrentUser" must be wrapped in provider ImplementationProviderContext(Oopsie)')
    );
  });

  test("throws an error when implementation does not include hook", () => {
    type IFace = {
      useCurrentUser(): { id: string; name: string };
    };

    const impl = {} as any;

    const [hooks, Provider] = createFacade<IFace>({ displayName: "Oopsie" });
    const wrapper = createWrapper(impl, Provider);

    expect(() => renderHook(() => hooks.useCurrentUser(), { wrapper })).toThrowError(
      new Error('ImplementationProviderContext(Oopsie) does not provide a hook named "useCurrentUser"')
    );
  });

  test("throws an error if ImplementationProvider is inside another ImplementationProvider", () => {
    type IFace = {};

    const [hooks, Provider] = createFacade<IFace>({ displayName: "NestedRoots" });

    expect(() =>
      render(
        <Provider implementation={{}}>
          <Provider implementation={{}}></Provider>
        </Provider>
      )
    ).toThrowError(
      new Error(
        "ImplementationProvider(NestedRoots) should not be rendered inside of another ImplementationProvider(NestedRoots)."
      )
    );
  });
});

test("type error when member is not a function", () => {
  interface IFace {
    useA: string;
    useB(): number;

    nested: {
      useC: boolean;
      useD(): boolean;
    };
  }

  const [hooks] = createFacade<IFace>();

  // @ts-expect-error
  expect(typeof hooks.useA).toBe("function");

  // not an error
  expect(typeof hooks.useB).toBe("function");

  // @ts-expect-error
  expect(typeof hooks.nested.useC).toBe("function");

  // not an error
  expect(typeof hooks.nested.useD).toBe("function");
});

test("type error when interface is not an object", () => {
  // @ts-expect-error
  createFacade<string>();
});

test("various type checking errors", () => {
  type IFace = {
    useA: string;
  };

  const impl: IFace = {
    useA: "400",
  };

  const [hooks, Provider] = createFacade<IFace>();

  const wrapper = createWrapper(impl, Provider);

  expect(() =>
    renderHook(
      () => {
        // @ts-expect-error
        hooks.useA();
      },
      { wrapper }
    )
  ).toThrowError(new Error('ImplementationProviderContext(Facade) provides a value "useA" but it is not a function.'));
});

test("hooks can reference other hooks in the implementation", () => {
  type IFace = {
    useCurrentUser(): { id: string; name: string };
    useUserId(): string;
  };

  const [hooks, Provider] = createFacade<IFace>();
  const { useUserId } = hooks;

  const impl = {
    useCurrentUser() {
      return {
        id: "12345",
        name: "Gabe",
      };
    },

    useUserId() {
      const user = this.useCurrentUser();
      return user.id;
    },
  };

  const wrapper = createWrapper(impl, Provider);

  const { result } = renderHook(() => useUserId(), { wrapper });

  expect(result.current).toEqual("12345");
});

describe("strict mode", () => {
  test("can swap out implementation when strict mode is false", async () => {
    type IFace = {
      useAddThree(a: number, b: number, c: number): number;
    };

    const [hooks, Provider] = createFacade<IFace>({ strict: false });

    const implA: IFace = {
      useAddThree(a, b, c) {
        return React.useMemo(() => a + b + c, [a, b, c, "add"]);
      },
    };

    const implB: IFace = {
      useAddThree(a, b, c) {
        return React.useMemo(() => a * b * c, [a, b, c, "multiply"]);
      },
    };

    const Component = () => {
      const amount = hooks.useAddThree(1, 3, 5);

      return (
        <>
          <div data-testid="amount">{amount}</div>
        </>
      );
    };

    const { getByTestId, rerender } = render(
      <Provider implementation={implA}>
        <Component />
      </Provider>
    );

    expect(getByTestId("amount").textContent).toEqual("9");

    rerender(
      <Provider implementation={implB}>
        <Component />
      </Provider>
    );

    expect(getByTestId("amount").textContent).toEqual("15");
  });

  test("can't swap out implementation when strict mode is true", async () => {
    type IFace = {
      useAddThree(a: number, b: number, c: number): number;
    };

    const implA: IFace = {
      useAddThree(a, b, c) {
        return React.useMemo(() => a + b + c, [a, b, c, "add"]);
      },
    };

    const implB: IFace = {
      useAddThree(a, b, c) {
        return React.useMemo(() => a * b * c, [a, b, c, "multiply"]);
      },
    };

    const [hooks, Provider] = createFacade<IFace>({ strict: true });

    const Component = () => {
      hooks.useAddThree(1, 3, 5);
      return null;
    };

    const { rerender } = render(
      <Provider implementation={implA}>
        <Component />
      </Provider>
    );

    expect(() => {
      rerender(
        <Provider implementation={implB}>
          <Component />
        </Provider>
      );
    }).toThrowError(
      new Error(
        'ImplementationProviderContext(Facade) unexpectedly received a new implementation. This is not allowed in strict mode. To disable this error use the option "strict: false".'
      )
    );
  });
});
