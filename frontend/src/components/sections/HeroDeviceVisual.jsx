import HeroIpadMockup from "./heroIpad/HeroIpadMockup";

export default function HeroDeviceVisual() {
  return (
    <div className="home-hero-devices home-hero-devices--layered home-hero-devices--ipad">
      <figure className="home-hero-devices__figure">
        <HeroIpadMockup />
      </figure>
    </div>
  );
}
