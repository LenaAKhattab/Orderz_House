import { useContext } from "react";
import { HomePageBlockingContext } from "../context/homePageBlockingContext";

export function useHomePageBlocking() {
  return useContext(HomePageBlockingContext);
}
