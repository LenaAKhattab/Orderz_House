import { createContext, useCallback, useContext, useMemo, useState } from "react";

const HomePageBlockingContext = createContext({
  homeBlocking: false,
  setHomeBlocking: () => {},
});

export function HomePageBlockingProvider({ children }) {
  const [homeBlocking, setHomeBlockingState] = useState(false);
  const setHomeBlocking = useCallback((v) => {
    setHomeBlockingState(Boolean(v));
  }, []);

  const value = useMemo(
    () => ({
      homeBlocking,
      setHomeBlocking,
    }),
    [homeBlocking, setHomeBlocking],
  );

  return <HomePageBlockingContext.Provider value={value}>{children}</HomePageBlockingContext.Provider>;
}

export function useHomePageBlocking() {
  return useContext(HomePageBlockingContext);
}
