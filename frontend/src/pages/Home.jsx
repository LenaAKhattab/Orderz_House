import HeroSection from "../components/sections/HeroSection";
import TrustedBySection from "../components/sections/TrustedBySection";
import CategoriesSection from "../components/sections/CategoriesSection";
import FaqSection from "../components/sections/FaqSection";

const Home = () => {
  return (
    <main className="home-page flex flex-1 flex-col">
      <HeroSection />
      <TrustedBySection />
      <CategoriesSection />
      <FaqSection />
    </main>
  );
};

export default Home;
