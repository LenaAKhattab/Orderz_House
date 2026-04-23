const navItems = ["الطلبات", "المستقلين", "العملاء", "لوحة التحكم"];

const Navbar = () => {
  return (
    <header className="navbar">
      <div className="container navbar-content">
        <div className="brand">
          <span className="brand-en">Orderz House</span>
          <span className="brand-ar">أوردرز هاوس</span>
        </div>

        <nav aria-label="القائمة الرئيسية">
          <ul className="nav-list">
            {navItems.map((item) => (
              <li key={item}>
                <a href="#" className="nav-link">
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
