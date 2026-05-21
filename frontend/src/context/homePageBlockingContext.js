import { createContext } from "react";

export const HomePageBlockingContext = createContext({
  homeBlocking: false,
  setHomeBlocking: () => {},
});
