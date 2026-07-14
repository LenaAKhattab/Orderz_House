import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/account/presentation/account_settings_screen.dart';
import '../../features/account/presentation/change_password_screen.dart';
import '../../features/account/presentation/delete_account_screen.dart';
import '../../features/account/presentation/edit_profile_screen.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/otp_verification_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/categories/presentation/services_screen.dart';
import '../../features/courses/presentation/course_details_screen.dart';
import '../../features/courses/presentation/courses_screen.dart';
import '../../features/client_orders/presentation/client_order_details_screen.dart';
import '../../features/client_orders/presentation/create_order_screen.dart';
import '../../features/client_orders/presentation/payment_return_screen.dart';
import '../../features/client_orders/data/payment_return_parser.dart';
import '../../features/freelancer/presentation/freelancer_order_detail_screen.dart';
import '../../features/freelancer/financial_claims/presentation/financial_claims_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/orders/presentation/orders_marketplace_screen.dart';
import '../../features/orders/presentation/pool_order_detail_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/public_pages/presentation/public_page_screen.dart';
import '../../features/shell/main_shell.dart';
import '../../features/shell/role_aware_my_orders_screen.dart';
import 'auth_redirect_policy.dart';
import 'deep_link_normalization.dart';
import 'routes.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _shellNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'shell');

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      // Phase 5G: never let raw orderzhouse:// (or other app schemes) hit matching.
      final rewritten = rewriteIncomingDeepLinkUri(state.uri) ??
          rewriteIncomingDeepLinkLocation(state.uri.toString());
      if (rewritten != null && rewritten != state.uri.toString()) {
        return rewritten;
      }
      // Also catch when go_router surfaces the raw string as path-like location.
      final rawLoc = state.matchedLocation;
      if (rawLoc.startsWith('orderzhouse://')) {
        return rewriteIncomingDeepLinkLocation(rawLoc) ??
            safeFallbackLocation(
              isAuthenticated: ref.read(authControllerProvider).isAuthenticated,
            );
      }

      final auth = ref.read(authControllerProvider);
      final location = state.matchedLocation;
      final isSplash = location == AppRoutes.splash;
      final isAuthRoute = location == AppRoutes.login ||
          location == AppRoutes.register ||
          location.startsWith(AppRoutes.otp);

      if (auth.status == AuthStatus.unknown) {
        if (isSplash || isPublicPaymentReturnRoute(location)) return null;
        return AppRoutes.splash;
      }

      if (auth.status == AuthStatus.unauthenticated) {
        if (isAuthRoute || isSplash) return null;
        if (isPublicPaymentReturnRoute(location)) return null;
        if (location.startsWith('/public/')) return null;
        if (shouldRedirectUnauthenticatedToLogin(location)) {
          final returnTo = state.uri.toString();
          if (returnTo == AppRoutes.login || returnTo.startsWith('${AppRoutes.login}?')) {
            return AppRoutes.login;
          }
          // Never bounce raw schemes into login redirect query.
          if (returnTo.startsWith('orderzhouse://')) {
            return AppRoutes.login;
          }
          return AppRoutes.loginWithRedirect(returnTo);
        }
        return null;
      }

      if (auth.status == AuthStatus.authenticated) {
        if (isSplash || isAuthRoute) return AppRoutes.home;
      }

      return null;
    },
    // Only one of onException / errorBuilder / errorPageBuilder is allowed.
    onException: (context, state, goRouter) {
      final rewritten = rewriteIncomingDeepLinkUri(state.uri) ??
          rewriteIncomingDeepLinkLocation(state.uri.toString());
      if (rewritten != null) {
        goRouter.go(rewritten);
        return;
      }
      final auth = ref.read(authControllerProvider);
      goRouter.go(safeFallbackLocation(isAuthenticated: auth.isAuthenticated));
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) {
          final redirect = state.uri.queryParameters[AppRoutes.loginRedirectQuery];
          return LoginScreen(redirectLocation: redirect);
        },
      ),
      GoRoute(
        path: AppRoutes.register,
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: AppRoutes.otp,
        builder: (context, state) {
          final email = state.uri.queryParameters['email'] ?? '';
          return OtpVerificationScreen(email: email);
        },
      ),
      GoRoute(
        path: AppRoutes.poolOrderDetails,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          return PoolOrderDetailScreen(orderId: id);
        },
      ),
      GoRoute(
        path: AppRoutes.paymentReturn,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final params = PaymentReturnParams.fromRouteQuery(state.uri.queryParameters);
          if (params == null) {
            return const Scaffold(
              body: Center(child: Text('رابط العودة غير صالح.')),
            );
          }
          return PaymentReturnScreen(params: params);
        },
      ),
      GoRoute(
        path: AppRoutes.freelancerPlans,
        parentNavigatorKey: _rootNavigatorKey,
        // Phase 5K: plans/subscription UI removed for Play Store compliance.
        redirect: (context, state) => AppRoutes.profile,
      ),
      GoRoute(
        path: AppRoutes.freelancerFinancialClaims,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const FinancialClaimsScreen(),
      ),
      GoRoute(
        path: AppRoutes.freelancerOrderDetails,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          return FreelancerOrderDetailScreen(orderId: id);
        },
      ),
      GoRoute(
        path: AppRoutes.clientCreateOrder,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const CreateClientOrderScreen(),
      ),
      GoRoute(
        path: AppRoutes.clientOrderDetails,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          return ClientOrderDetailsScreen(orderId: id);
        },
      ),
      GoRoute(
        path: AppRoutes.notifications,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: AppRoutes.accountSettings,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const AccountSettingsScreen(),
      ),
      GoRoute(
        path: AppRoutes.accountEditProfile,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const EditProfileScreen(),
      ),
      GoRoute(
        path: AppRoutes.accountChangePassword,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const ChangePasswordScreen(),
      ),
      GoRoute(
        path: AppRoutes.accountDelete,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const DeleteAccountScreen(),
      ),
      GoRoute(
        path: AppRoutes.services,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const ServicesScreen(),
      ),
      GoRoute(
        path: AppRoutes.courseDetails,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          return CourseDetailsScreen(courseId: id);
        },
      ),
      GoRoute(
        path: AppRoutes.publicPage,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) {
          final slug = state.pathParameters['slug'] ?? '';
          return PublicPageScreen(slug: slug);
        },
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return MainShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            navigatorKey: _shellNavigatorKey,
            routes: [
              GoRoute(
                path: AppRoutes.home,
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.myOrders,
                builder: (context, state) => const RoleAwareMyOrdersScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.marketplace,
                builder: (context, state) => const OrdersMarketplaceScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.courses,
                builder: (context, state) => const CoursesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.profile,
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(this.ref) {
    ref.listen(authControllerProvider, (previous, next) => notifyListeners());
  }

  final Ref ref;
}
