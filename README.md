# React Facade

An experimental 2kb library that uses [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) and TypeScript to create a strongly typed [facade](https://en.wikipedia.org/wiki/Facade_pattern) for your React hooks.

- **Dependency inversion between components and hooks:** Build components that rely on hooks that do not have a particular implementation.
- **Works with all of your existing hooks:** Extract hooks to the top level of your program and replace them with a facade.
- **Simplified component testing:** You were already testing your hooks anyway (right?), so why test them again? Focus on rendering outcomes rather than bungling around with a cumbersome setup for test cases.

This library effectively allows you to write components with placeholders for hooks. Their implementation is injected via React context so that they can be changed between views or testing. It is dependency injection for hooks that does not require higher-order functions/Components.

## Example

Consider an application which describes its data-fetching layer in the UI with the following list of hooks,

```ts
function useCurrentUser(): User;
function usePostById(id: string): { loading: boolean; error?: Error; data?: Post };
function useCreateNewPost(): (postData: PostData) => Promise<Post>;
// etc...
```

Given this interface, a developer can reliably use these hooks without knowing anything about their underlying _implementation_ (leaving aside questions of fidelity). That is to say: the developer _only_ cares about the _interface_. The problem, however, is that by inlining a hook as part of the React component, the _implementation_ cannot be ignored. For example, a component `UserProfile` may have the following definition,

```ts
// user-profile.tsx

import React from "react";
import { userCurrentUser } from "./hooks";

export function UserProfile() {
  const user = useCurrentUser();

  // ... render user profile
}
```

The developer of this component may not care about the implementation of `useCurrentUser`, but the tests sure do! If under the hood `useCurrentUser` calls the react-redux `useSelector`, then `UserProfile` depends directly on a global Redux store. Moreover, any component using `UserProfile` also has this dependency. The coupling between the store and component tree is hard-coded by this hook. Yikes! And yet this is not an uncommon problem. 🙃

Consider the same problem where the _implementation_ can be completely ignored and replaced by dependency injection. We define the same interface using `createFacade`,

```ts
// facade.ts

import { createFacade } from "react-facade";

type Hooks = {
  useCurrentUser(): User;
  usePostById(id: string): { loading?: boolean; error?: Error; data?: Post };
  useCreateNewPost(): (postData: PostData) => Promise<Post>;
  // ...
};

// no implementation!
export const [hooks, ImplementationProvider] = createFacade<Hooks>();
```

And then the `UserProfile` becomes,

```ts
// user-profile.tsx

import React from "react";
import { hooks } from "./facade";

export function UserProfile() {
  const user = hooks.useCurrentUser();

  // ... render user profile
}
```

This time, we don't care about the _implementation_ because there literally isn't one. Depending on the environment, it can be injected by passing a different _implementation_ to `ImplementationProvider`.

At the application level, we might use `useSelector` to fetch the current user from our store,

```tsx
// app.tsx

import React from "react";
import { useSelector } from "react-redux";
import { ImplementationProvider } from "./facade";
// ...

const implementation = {
  useCurrentUser(): User {
    return useSelector(getCurrentUser);
  },

  // ...
};

return (
  <ImplementationProvider implementation={implementation}>
    <UserProfile />
  </ImplementationProvider>
);
```

While in a test environment, we can return a stub user so long as it matches our _interface_,

```tsx
// user-profile.test.tsx

import React from "react";
import { render } from "@testing-library/react";
import { ImplementationProvider } from "./facade";
// ...

test("some thing", () => {
  const implementation = {
    useCurrentUser(): User {
      return {
        id: "stub",
        name: "Gabe",
        // ...
      };
    },

    // ...
  };

  const result = render(
    // What is `__UNSAFE_Partial`? See API section
    <ImplementationProvider.__UNSAFE_Partial implementation={implementation}>
      <UserProfile />
    </ImplementationProvider.__UNSAFE_Partial>
  );

  // ...
});
```

We are programming purely toward the _interface_ and _NOT_ the _implementation_!

Again, consider how this might simplify testing a component that relied on this hook,

```ts
function usePostById(id: string): { loading: boolean; error?: Error; data?: Post };
```

Testing different states is simply a matter of declaratively passing in the right one,

```ts
// post.test.tsx

const loadingImplementation = {
  usePostById(id: string) {
    return {
      loading: true,
    };
  },
};

const errorImplementation = {
  usePostById(id: string) {
    return {
      loading: false,
      error: new Error("uh oh!"),
    };
  },
};

// ...

test("shows the loading spinner", () => {
  const result = render(
    <ImplementationProvider.__UNSAFE_Partial implementation={loadingImplementation}>
      <Post id={id} />
    </ImplementationProvider.__UNSAFE_Partial>
  );

  // ...
});

test("displays an error", () => {
  const result = render(
    <ImplementationProvider.__UNSAFE_Partial implementation={errorImplementation}>
      <Post id={id} />
    </ImplementationProvider.__UNSAFE_Partial>
  );

  // ...
});
```

## API

### `createFacade`

```ts
function createFacade<T>(displayName?: string): [Proxy<T>, ImplementationProvider<T>];
```

Takes a type definition `T` - which must be an object where each member is a function - and returns the tuple of the interface `T` (via a Proxy) and an `ImplementationProvider`. The developer provides the real implementation of the interface through the Provider.

The `ImplementationProvider` does not collide with other `ImplementationProvider`s created by other `createFacade` calls, so you can make as many of these as you need.

### `ImplementationProvider<T>`

Accepts a prop `implementation: T` that implements the interface defined in `createFacade<T>()`.

```ts
const implementation = {
  useCurrentUser(): User {
    return useSelector(getCurrentUser);
  },

  // ...
};

return (
  <ImplementationProvider implementation={implementation}>
    <UserProfile />
  </ImplementationProvider>
);
```

### `ImplementationProvider<T>.__UNSAFE_Partial`

Used for partially implementing the interface when you don't need to implement the whole thing but still want it to type-check (tests?). For the love of God, please do not use this outside of tests...

```tsx
<ImplementationProvider.__UNSAFE_Partial implementation={partialImplementation}>
  <UserProfile />
</ImplementationProvider.__UNSAFE_Partial>
```

## Installing

```bash
npm install react-facade
```

## Asked Questions

### Why not just use `jest.mock?`

Mocking at the module level has the notable downside that type safety is optional. The onus is on the developer to ensure that the mock matches the actual interface. While stubbing with a _static_ language is dangerous enough because it removes critical interactions between units of code, a _dynamic_ language is even worse because changes to the real implementation interface (without modifications to the stub) can result in runtime type errors in production. Choosing to forgo the type check means that you might as well be writing JavaScript.

### Can I use this with plain JavaScript?

It's ~2021~ 2022, bud. Why aren't you writing TypeScript?

It is _really_ important that this library is used with TypeScript. It's a trick to use a Proxy object in place of the real implementation when calling `createFacade`, so nothing stops you from calling a function that does not exist. Especially bad would be destructuring so your fake hook could be used elsewhere in the program.

```js
// hooks.js

export const { useSomethingThatDoesNotExist } = hooks;
```

```js
// my-component.jsx

import { useSomethingThatDoesNotExist } from "./hooks";

const MyComponent = () => {
  const value = useSomethingThatDoesNotExist(); // throw new Error('oopsie-doodle!')
};
```

The only thing preventing you from cheating like this is good ol' TypeScript.

### Is this safe to use?

Popular libraries like [`immer`](https://github.com/immerjs/immer) use the same trick of wrapping data `T` in a `Proxy` and present it as `T`, so I don't think you should be concerned. Proxy has [~95% browser support](https://caniuse.com/proxy).
