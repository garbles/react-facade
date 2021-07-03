# React Facade

A simple library that uses [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) and TypeScript to create a strongly typed [facade](https://en.wikipedia.org/wiki/Facade_pattern) for your React hooks. It's dependency injection for hooks!

- **Dependency inversion between components and hooks:** Build components that rely on hooks which do not have a particular implementation.
- **Works with all of your existing hooks:** Extract hooks to the top level of your program and replace them with a facade.
- **Simplified component testing:** You were already testing your hooks anyway (right?), so why test them again? Focus on rendering outcomes rather than bungling around with difficult to setup test cases.

## Example

Consider an application which describes its data-fetching layer in the UI with the following list of hooks,

```ts
function useCurrentUser(): User;
function usePostById(id: string): { loading?: boolean; error?: Error; data?: Post };
function useCreateNewPost(): (postData: PostData) => Promise<Post>;
// etc...
```

Given this interface, a developer can reliably use these hooks without knowing anything about their underlying _implementation_. That is to say: the developer _only_ cares about the _interface_. The problem, however, is that by inlining a hook as part of the React component, the _implementation_ cannot be ignored. For example, a component `UserProfile` may have the following definition,

```ts
// user-profile.ts

import React from "react";
import { userCurrentUser } from "./hooks";

export function UserProfile() {
  const user = useCurrentUser();

  // ... render user profile
}
```

The developer of this component may not care about the implementation of `useCurrentUser`, but the tests sure do! If under the hood `useCurrentUser` is calling the react-redux `useSelector`, then `UserProfile` depends directly on a global Redux store. What's more, any component using `UserProvider` has also has this dependency by default. The coupling between the store and component tree is hard-coded. Yikes! And yet this is not an uncommon problem.

Now consider the same problem where the _implementation_ can be completely ignored with dependency injection in its place. We define the same interface using `createFacade`,

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
// user-profile.ts

import React from "react";
import { hooks } from "./facade";

export function UserProfile() {
  const user = hooks.useCurrentUser();

  // ... render user profile
}
```

This time, the developers does not care about the _implementation_ because there literally isn't one. It can be replaced depending on the environment by passing a different _implementation_ to `ImplementationProvider`.

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

While in the second, we can return a stub user so long as it matches our _interface_.

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
    <ImplementationProvider.Partial implementation={implementation}>
      <UserProfile />
    </ImplementationProvider.Partial>
  );

  // ...
});
```

## API

### `createFacade`

```ts
function createFacade<T>(displayName?: string): [Proxy<T>, ImplementationProvider<T>];
```

Takes a type definition `T` - which must be an object where each member is a function - and returns the tuple of the interface `T` (through a Proxy) and a Provider. The developer provides the real implementation of the interface through the `ImplementationProvider`.

The `ImplementationProvider` does not collide with other `ImplementationProvider`s, so you can make as many of these as you need.

### `ImplementationProvider<T>`

Accepts a single prop `implementation: T` that implements the interface defined in `createFacade<T>()`.

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

`ImplementationProvider<T>` also exposes a static method `ImplementationProvider.Partial` for partially implementing the interface when you don't need to implement the whole thing but still want it to typecheck (tests).

## Installing

```bash
npm install react-facade
```

## Limitations

It is _really_ important that this library is used with TypeScript. It's kind of a trick to use a Proxy object in place of a real implementation when calling `createFacade`, so there's really nothing stopping you for calling `hooks.useSomethingThatDoesNotExist()`. Especially bad would be destructuring `const { useSomethingThatDoesNotExist } = hooks` so that your fake hook could be used elsewhere in the program. The only thing preventing you from cheating like this is good ol' TypeScript.
