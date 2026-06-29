import usePopupAds from "../../hooks/usePopupAds";
import PopupAdModal from "./PopupAdModal";

/** Global site popup ads — mounted once inside the router. */
export default function PopupAdsHost() {
  const { activeAd, dismiss } = usePopupAds();
  return <PopupAdModal ad={activeAd} onClose={dismiss} />;
}
