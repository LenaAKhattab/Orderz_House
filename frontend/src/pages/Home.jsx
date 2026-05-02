import HeroSection from "../components/sections/HeroSection";
import CategoriesSection from "../components/sections/CategoriesSection";

const Home = () => {
  return (
    <main className="home-page flex flex-1 flex-col">
      <HeroSection />
      <CategoriesSection />
    </main>
  );
};

export default Home;
