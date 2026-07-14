abstract final class AppRoutes {
  static const splash = '/splash';
  static const login = '/login';
  static const loginRedirectQuery = 'redirect';
  static const register = '/register';
  static const otp = '/otp';
  static const shell = '/';
  static const home = '/home';
  static const services = '/services';
  static const courses = '/courses';
  static const courseDetails = '/courses/:id';
  static const marketplace = '/marketplace';
  static const myOrders = '/my-orders';
  static const profile = '/profile';
  static const poolOrderDetails = '/orders/pool/:id';
  static const clientOrderDetails = '/client/orders/:id';
  static const clientCreateOrder = '/client/orders/create';
  static const paymentReturn = '/payment/return';
  static const publicPage = '/public/:slug';

  static const freelancerOrderDetails = '/freelancer/my-orders/:id';
  static const freelancerPlans = '/freelancer/plans';
  static const freelancerFinancialClaims = '/freelancer/financial-claims';
  static const notifications = '/notifications';

  static const accountSettings = '/account/settings';
  static const accountEditProfile = '/account/edit-profile';
  static const accountChangePassword = '/account/change-password';
  static const accountDelete = '/account/delete';

  static String courseDetailsPath(String id) => '/courses/$id';
  static String poolOrderPath(String id) => '/orders/pool/$id';
  static String clientOrderPath(String id) => '/client/orders/$id';
  static String freelancerOrderPath(String id) => '/freelancer/my-orders/$id';

  static const privacyPolicy = 'privacy-policy';
  static const termsConditions = 'terms-conditions';
  static const guarantee = 'guarantee';
  static const helpCenter = 'help-center';
  static const helpCenterPublicRoute = '/public/help-center';

  static String publicPagePath(String slug) => '/public/$slug';

  static String loginWithRedirect(String returnLocation) {
    final trimmed = returnLocation.trim();
    if (trimmed.isEmpty) return login;
    return '$login?$loginRedirectQuery=${Uri.encodeComponent(trimmed)}';
  }
}
