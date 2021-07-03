import React from "react";

export type FacadeInterface = {
  [hookName: string]: (...args: any[]) => any;
};

export type ImplementationProvider<T extends FacadeInterface> = React.ComponentType<{ implementation: T }> & {
  Partial: React.ComponentType<{ implementation: Partial<T> }>;
};

export type Facade<T extends FacadeInterface> = [T, ImplementationProvider<T>];
