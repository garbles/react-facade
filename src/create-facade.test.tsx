import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import { createFacade } from "./create-facade";

test("creates a implementation", () => {
  type IFace = {
    useAString(): string;
    useANumber(): number;
  };

  const [hooks, ImplementationProvider] = createFacade<IFace>();

  const Component = () => {
    const a = hooks.useAString();
    const b = hooks.useANumber();

    return (
      <>
        <div data-testid="a-string">{a}</div>
        <div data-testid="a-number">{b}</div>
      </>
    );
  };

  const implementation = {
    useAString() {
      return "some string";
    },

    useANumber() {
      return 123;
    },
  };

  const { getByTestId } = render(
    <ImplementationProvider implementation={implementation}>
      <Component />
    </ImplementationProvider>
  );

  expect(getByTestId("a-string").innerHTML).toEqual("some string");
  expect(getByTestId("a-number").innerHTML).toEqual("123");
});

test("implementations can be hooks", () => {
  jest.useFakeTimers();

  type IFace = {
    useCounter(interval: number): number;
  };

  const [hooks, ImplementationProvider] = createFacade<IFace>();

  const Component = () => {
    const count = hooks.useCounter(100);

    return (
      <>
        <div data-testid="count">{count}</div>
      </>
    );
  };

  const implementation: IFace = {
    useCounter(interval: number) {
      const [count, increment] = React.useReducer((count) => count + 1, 0);

      React.useEffect(() => {
        const intervalId = setInterval(increment, interval);
        return () => clearInterval(intervalId);
      }, [interval, increment]);

      return count;
    },
  };

  const { getByTestId } = render(
    <ImplementationProvider implementation={implementation}>
      <Component />
    </ImplementationProvider>
  );

  expect(getByTestId("count").innerHTML).toEqual("0");

  act(() => {
    jest.advanceTimersByTime(3000);
  });

  expect(getByTestId("count").innerHTML).toEqual("30");
});

test("can be destructured", () => {
  type IFace = {
    useCurrentUser(): { id: string; name: string };
  };

  const [hooks] = createFacade<IFace>();

  expect(() => hooks.useCurrentUser).not.toThrow();
});

test("has the same name", () => {
  type IFace = {
    useCurrentUser(): { id: string; name: string };
  };

  const [hooks] = createFacade<IFace>();

  expect(hooks.useCurrentUser.name).toEqual("useCurrentUser");
});

test("deconstructing always returns the same reference", () => {
  type IFace = {
    useCurrentUser(): { id: string; name: string };
  };

  const [hooks] = createFacade<IFace>();

  expect(hooks.useCurrentUser).toBe(hooks.useCurrentUser);
});

describe("errors", () => {
  let error: typeof console.error;

  beforeEach(() => {
    error = console.error;
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = error;
  });

  test("throws an error when provider is not used", () => {
    type IFace = {
      useCurrentUser(): { id: string; name: string };
    };

    const [hooks] = createFacade<IFace>({ displayName: "Oopsie" });

    const Component = () => {
      const user = hooks.useCurrentUser();

      return (
        <>
          <div data-testid="id">{user.id}</div>
          <div data-testid="name">{user.name}</div>
        </>
      );
    };

    expect(() => render(<Component />)).toThrowError(
      new Error('Component using "useCurrentUser" must be wrapped in provider ImplementationProviderContext(Oopsie)')
    );
  });

  test("throws an error when implementation does not include hook", () => {
    type IFace = {
      useCurrentUser(): { id: string; name: string };
    };

    const [hooks, ImplementationProvider] = createFacade<IFace>({ displayName: "Oopsie" });

    const Component = () => {
      const user = hooks.useCurrentUser();

      return (
        <>
          <div data-testid="id">{user.id}</div>
          <div data-testid="name">{user.name}</div>
        </>
      );
    };

    const implementation = {} as any;

    expect(() =>
      render(
        <ImplementationProvider implementation={implementation}>
          <Component />
        </ImplementationProvider>
      )
    ).toThrowError(new Error('ImplementationProviderContext(Oopsie) does not provide a hook named "useCurrentUser"'));
  });

  test("throws an error if ImplementationProvider is inside another ImplementationProvider", () => {
    type IFace = {};

    const [hooks, ImplementationProvider] = createFacade<IFace>({ displayName: "NestedRoots" });

    expect(() =>
      render(
        <ImplementationProvider implementation={{}}>
          <ImplementationProvider implementation={{}}></ImplementationProvider>
        </ImplementationProvider>
      )
    ).toThrowError(
      new Error(
        "ImplementationProvider(NestedRoots) should not be rendered inside of another ImplementationProvider(NestedRoots)."
      )
    );
  });
});

test("allows interfaces as types for create facade as well", () => {
  interface AInterface {
    useX(): number;
  }

  interface BInterface {
    useA: number;
    useB(): number;
    useC(): string;
  }

  type CInterface = {
    useD: number;
    useE(): number;
  };

  const [hooksA] = createFacade<AInterface>();
  const [hooksB] = createFacade<BInterface>();
  const [hooksC, Provider] = createFacade<CInterface>();

  // @ts-expect-error
  const hook = hooksB.useA;

  // @ts-expect-error;
  const hook2 = hooksC.useD;

  /**
   * The inner proxy object throws an error here.
   */

  const Component = () => {
    hook2();

    return null;
  };

  const implementationA = {
    useE() {
      return 12;
    },
  };

  const implementationB = {
    useD: 400,
    useE() {
      return 12;
    },
  };

  expect(() =>
    render(
      <Provider implementation={implementationA}>
        <Component />
      </Provider>
    )
  ).toThrowError(new Error('ImplementationProviderContext(Facade) does not provide a hook named "useD"'));

  expect(() =>
    render(
      <Provider implementation={implementationB}>
        <Component />
      </Provider>
    )
  ).toThrowError(new Error('Expected "useD" to be a function but wasn\'t'));

  // @ts-expect-error
  createFacade<string>();
});

test("hooks can reference other hooks in the implementation", () => {
  type IFace = {
    useCurrentUser(): { id: string; name: string };
    useUserId(): string;
  };

  const [hooks, Provider] = createFacade<IFace>();

  const Component = () => {
    const userId = hooks.useUserId();

    return (
      <>
        <div data-testid="id">{userId}</div>
      </>
    );
  };

  const implementation = {
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

  const { getByTestId } = render(
    <Provider implementation={implementation}>
      <Component />
    </Provider>
  );

  expect(getByTestId("id").textContent).toEqual("12345");
});

describe("strict mode", () => {
  test("can swap out implementation when strict mode is false", async () => {
    type IFace = {
      useAddThree(a: number, b: number, c: number): number;
    };

    const [hooks, Provider] = createFacade<IFace>({ strict: false });

    const Component = () => {
      const amount = hooks.useAddThree(1, 3, 5);

      return (
        <>
          <div data-testid="amount">{amount}</div>
        </>
      );
    };

    const implementationA: IFace = {
      useAddThree(a, b, c) {
        return React.useMemo(() => a + b + c, [a, b, c, "add"]);
      },
    };

    const { getByTestId, rerender } = render(
      <Provider implementation={implementationA}>
        <Component />
      </Provider>
    );

    expect(getByTestId("amount").textContent).toEqual("9");

    const implementationB: IFace = {
      useAddThree(a, b, c) {
        return React.useMemo(() => a * b * c, [a, b, c, "multiply"]);
      },
    };

    rerender(
      <Provider implementation={implementationB}>
        <Component />
      </Provider>
    );

    expect(getByTestId("amount").textContent).toEqual("15");
  });

  test("can't swap out implementation when strict mode is true", async () => {
    type IFace = {
      useAddThree(a: number, b: number, c: number): number;
    };

    const [hooks, Provider] = createFacade<IFace>({ strict: true });

    const Component = () => {
      const amount = hooks.useAddThree(1, 3, 5);

      return (
        <>
          <div data-testid="amount">{amount}</div>
        </>
      );
    };

    const implementationA: IFace = {
      useAddThree(a, b, c) {
        return React.useMemo(() => a + b + c, [a, b, c, "add"]);
      },
    };

    const { rerender } = render(
      <Provider implementation={implementationA}>
        <Component />
      </Provider>
    );

    const implementationB: IFace = {
      useAddThree(a, b, c) {
        return React.useMemo(() => a * b * c, [a, b, c, "multiply"]);
      },
    };

    expect(() => {
      rerender(
        <Provider implementation={implementationB}>
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
