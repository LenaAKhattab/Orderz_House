abstract final class AppRoutes {
  static const splash = '/splash';
  static const login = '/login';
  static const loginRedirectQuery = 'redirect';
  static const register = '/register';
  static const otp = '/otp';
  static const forgotPassword = '/forgot-password';
  static const forgotPasswordOtp = '/forgot-password/otp';
  static const forgotPasswordReset = '/forgot-password/reset';
  static const freelancerPantry = '/freelancer/pantry';
  static const freelancerPantryDetails = '/freelancer/pantry/:id';

  static String freelancerPantryDetail(String id) => '/freelancer/pantry/$id';
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
  static const freelancerAccountActivation = '/freelancer/account-activation';
  static const freelancerFinancialClaims = '/freelancer/financial-claims';
  static const freelancerMiniArticles = '/freelancer/mini-articles';
  static const freelancerMiniArticleDetail = '/freelancer/mini-articles/:id';
  static const freelancerMyArticles = '/freelancer/my-articles';
  static const freelancerMyArticleSubmit = '/freelancer/my-articles/:applicationId/submit';
  static const notifications = '/notifications';

  static const superAdminActivation = '/super-admin/activation';
  static const superAdminIdentityRequests = '/super-admin/identity-requests';
  static const superAdminSubscriptionActivation = '/super-admin/subscription-activation';
  static const superAdminPackageAssignment = '/super-admin/packages';
  static const superAdminPackageUserDetail = '/super-admin/packages/:userId';
  static const superAdminActivationKycDetail = '/super-admin/activation/kyc/:id';
  static const superAdminActivationSubscriptionDetail = '/super-admin/activation/subscription/:id';
  static const superAdminClaims = '/super-admin/claims';
  static const superAdminPantry = '/super-admin/pantry';
  static const superAdminPantryRequest = '/super-admin/pantry/requests/:id';
  static const superAdminPantryDelivery = '/super-admin/pantry/deliveries/:id';
  static const superAdminArticles = '/super-admin/articles';
  static const superAdminArticleDetail = '/super-admin/articles/:id';
  static const superAdminFeedback = '/super-admin/feedback';
  static const superAdminFeedbackDetail = '/super-admin/feedback/:id';

  static String superAdminPantryRequestPath(String id) => '/super-admin/pantry/requests/$id';
  static String superAdminPantryDeliveryPath(String id) => '/super-admin/pantry/deliveries/$id';
  static String superAdminArticlePath(String id) => '/super-admin/articles/$id';
  static String superAdminActivationKycPath(String id) => '/super-admin/activation/kyc/$id';
  static String superAdminActivationSubscriptionPath(String id) =>
      '/super-admin/activation/subscription/$id';
  static String superAdminPackageUserPath(String userId) => '/super-admin/packages/$userId';
  static String superAdminFeedbackDetailPath(String id) => '/super-admin/feedback/$id';

  static const accountSettings = '/account/settings';
  static const accountEditProfile = '/account/edit-profile';
  static const accountChangePassword = '/account/change-password';
  static const accountDelete = '/account/delete';

  static String courseDetailsPath(String id) => '/courses/$id';
  static String poolOrderPath(String id) => '/orders/pool/$id';
  static String clientOrderPath(String id) => '/client/orders/$id';
  static String freelancerOrderPath(String id) => '/freelancer/my-orders/$id';
  static String freelancerMiniArticlePath(String id) => '/freelancer/mini-articles/$id';
  static String freelancerMyArticleSubmitPath(String applicationId) =>
      '/freelancer/my-articles/$applicationId/submit';

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
