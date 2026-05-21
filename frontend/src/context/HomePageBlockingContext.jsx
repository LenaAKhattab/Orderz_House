import { useCallback, useMemo, useState } from "react";
import { HomePageBlockingContext } from "./homePageBlockingContext";

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
