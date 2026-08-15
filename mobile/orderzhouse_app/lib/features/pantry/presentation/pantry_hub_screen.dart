import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/pantry_status.dart';
import 'pantry_controllers.dart';
import 'pantry_request_card.dart';
import 'pantry_sheets.dart';

class PantryHubScreen extends ConsumerStatefulWidget {
  const PantryHubScreen({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  ConsumerState<PantryHubScreen> createState() => _PantryHubScreenState();
}

class _PantryHubScreenState extends ConsumerState<PantryHubScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this, initialIndex: widget.initialTab.clamp(0, 1));
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(pantryOpenRequestsProvider);
    ref.invalidate(pantryMyWorkProvider);
    await Future.wait([
      ref.read(pantryOpenRequestsProvider.future),
      ref.read(pantryMyWorkProvider.future),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    if (!auth.isAuthenticated || auth.user?.usesFreelancerExperience != true) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: const Text('بيت المونة')),
        body: const OhEmptyBody(
          message: 'بيت المونة متاح للمستقلين المسجّلين فقط.',
          icon: Icons.lock_outline,
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(
        title: const Text('بيت المونة'),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'الطلبات المفتوحة'),
            Tab(text: 'أعمالي'),
          ],
        ),
      ),
      body: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Text(
              'طلبات داخلية من الشركة لتنفيذ أعمال جاهزة مسبقًا. هذه الطلبات منفصلة عن طلبات العملاء في السوق.',
              textAlign: TextAlign.right,
              style: TextStyle(color: AppColors.textMuted, height: 1.45),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabs,
              children: [
                _OpenList(onRefresh: _refresh),
                _MyWorkList(onRefresh: _refresh),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OpenList extends ConsumerWidget {
  const _OpenList({required this.onRefresh});

  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(pantryOpenRequestsProvider);
    return async.when(
      loading: () => const OhLoadingBody(message: 'جارٍ تحميل طلبات بيت المونة...'),
      error: (error, _) => OhErrorBody(
        message: apiErrorMessage(error, fallback: 'تعذر تحميل الطلبات. حاول مجددًا.'),
        onRetry: onRefresh,
      ),
      data: (items) {
        if (items.isEmpty) {
          return RefreshIndicator(
            onRefresh: onRefresh,
            child: ListView(
              children: const [
                SizedBox(height: 80),
                OhEmptyBody(message: 'لا توجد طلبات مفتوحة حالياً في بيت المونة.', icon: Icons.inventory_2_outlined),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: onRefresh,
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            itemCount: items.length,
            separatorBuilder: (context, _) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final request = items[index];
              return PantryRequestCard(
                request: request,
                showBidButton: pantryCanBid(request.status),
                onDetails: () => context.push(AppRoutes.freelancerPantryDetail(request.id)),
                onBid: pantryCanBid(request.status)
                    ? () async {
                        final ok = await showPantryBidSheet(context, ref, requestId: request.id);
                        if (ok && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('تم تقديم العرض بنجاح')),
                          );
                          ref.invalidate(pantryOpenRequestsProvider);
                        }
                      }
                    : null,
              );
            },
          ),
        );
      },
    );
  }
}

class _MyWorkList extends ConsumerWidget {
  const _MyWorkList({required this.onRefresh});

  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(pantryMyWorkProvider);
    return async.when(
      loading: () => const OhLoadingBody(message: 'جارٍ تحميل أعمالك...'),
      error: (error, _) => OhErrorBody(
        message: apiErrorMessage(error, fallback: 'تعذر تحميل أعمالك. حاول مجددًا.'),
        onRetry: onRefresh,
      ),
      data: (items) {
        final work = items
            .where((r) => r.assignedFreelancerId != null && r.assignedFreelancerId!.trim().isNotEmpty)
            .toList();
        if (work.isEmpty) {
          return RefreshIndicator(
            onRefresh: onRefresh,
            child: ListView(
              children: const [
                SizedBox(height: 80),
                OhEmptyBody(
                  message: 'لا توجد أعمال معيَّنة لك في بيت المونة حالياً.',
                  icon: Icons.work_outline,
                ),
              ],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: onRefresh,
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            itemCount: work.length,
            separatorBuilder: (context, _) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final request = work[index];
              return PantryRequestCard(
                request: request,
                showDeliverButton: pantryCanDeliver(request.status),
                onDetails: () => context.push(AppRoutes.freelancerPantryDetail(request.id)),
                onDeliver: pantryCanDeliver(request.status)
                    ? () async {
                        final ok = await showPantryDeliverySheet(context, ref, requestId: request.id);
                        if (ok && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('تم إرسال التسليم')),
                          );
                          ref.invalidate(pantryMyWorkProvider);
                        }
                      }
                    : null,
              );
            },
          ),
        );
      },
    );
  }
}
