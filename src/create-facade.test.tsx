import { act, render } from "@testing-library/react";
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

test("works with arbitrary higher-order data structures", () => {
  type IFace = {
    useCurrentUser(): { id: string; name: string };
  };

  const [hooks, ImplementationProvider] = createFacade<IFace>();

  const Component = () => {
    const user = hooks.useCurrentUser();

    return (
      <>
        <div data-testid="id">{user.id}</div>
        <div data-testid="name">{user.name}</div>
      </>
    );
  };

  class UserImplementation implements IFace {
    useCurrentUser() {
      return {
        id: "1",
        name: "Gabe",
      };
    }
  }

  const implementation = new UserImplementation();

  render(
    <ImplementationProvider implementation={implementation}>
      <Component />
    </ImplementationProvider>
  );
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

    const [hooks] = createFacade<IFace>("Oopsie");

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
      new Error('Component using "useCurrentUser" must be wrapped in provider Oopsie')
    );
  });

  test("throws an error when implementation does not include hook", () => {
    type IFace = {
      useCurrentUser(): { id: string; name: string };
    };

    const [hooks, ImplementationProvider] = createFacade<IFace>("Oopsie");

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
    ).toThrowError(new Error('Oopsie does not provide a hook named "useCurrentUser"'));
  });
});
