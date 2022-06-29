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

test("doesn't re-render when the implementation changes", () => {
  type IFace = {
    useCountRenders(): void;
  };

  const [hooks, ImplementationProvider] = createFacade<IFace>();

  const Component = React.memo(() => {
    const a = hooks.useCountRenders();

    return <div />;
  });

  let renderCount = 0;

  const implementation = {
    useCountRenders() {
      renderCount++;
    },
  };

  const { rerender } = render(
    <ImplementationProvider implementation={{ ...implementation }}>
      <Component />
    </ImplementationProvider>
  );

  expect(renderCount).toEqual(1);

  rerender(
    <ImplementationProvider implementation={{ ...implementation }}>
      <Component />
    </ImplementationProvider>
  );

  rerender(
    <ImplementationProvider implementation={{ ...implementation }}>
      <Component />
    </ImplementationProvider>
  );

  expect(renderCount).toEqual(1);
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
      new Error('Component using "useCurrentUser" must be wrapped in provider ImplementationProviderContext(Oopsie)')
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
    ).toThrowError(new Error('ImplementationProviderContext(Oopsie) does not provide a hook named "useCurrentUser"'));
  });

  test("throws an error if ImplementationProvider is inside another ImplementationProvider", () => {
    type IFace = {};

    const [hooks, ImplementationProvider] = createFacade<IFace>("NestedRoots");

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
