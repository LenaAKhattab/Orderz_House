import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/super_admin_actions.dart';
import '../data/super_admin_controllers.dart';
import '../data/super_admin_models.dart';
import '../data/super_admin_package_models.dart';
import 'super_admin_action_dialogs.dart';
import 'super_admin_queue_screens.dart';
import 'super_admin_ui.dart';
import '../../../core/i18n/i18n.dart';

class SuperAdminPackageAssignmentScreen extends ConsumerStatefulWidget {
  const SuperAdminPackageAssignmentScreen({super.key});

  @override
  ConsumerState<SuperAdminPackageAssignmentScreen> createState() =>
      _SuperAdminPackageAssignmentScreenState();
}

class _SuperAdminPackageAssignmentScreenState extends ConsumerState<SuperAdminPackageAssignmentScreen> {
  final _searchController = TextEditingController();
  SuperAdminPackageListFilters _filters = const SuperAdminPackageListFilters();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    await ref.read(superAdminPackageAssignmentProvider.notifier).refresh(query: _searchController.text);
  }

  void _resetFilters() {
    setState(() => _filters = const SuperAdminPackageListFilters());
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(superAdminPackageAssignmentProvider);
    return SuperAdminQueueScaffold(
      title: superAdminPackageAssignmentTitleAr,
      onRefresh: _search,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    textAlign: TextAlign.start,
                    decoration: InputDecoration(
                      hintText: tr('بحث بالاسم أو البريد'),
                      prefixIcon: Icon(Icons.search),
                    ),
                    onSubmitted: (_) => _search(),
                  ),
                ),
                const SizedBox(width: 8),
                OhButton(label: tr('بحث'), expand: false, onPressed: _search),
              ],
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => ListView(
                physics: AlwaysScrollableScrollPhysics(),
                children: [SizedBox(height: 120), OhLikeLoading()],
              ),
              error: (error, _) => SuperAdminQueueErrorOrEmpty(
                isError: true,
                message: superAdminLoadErrorMessage(error),
                onRetry: _search,
              ),
              data: (items) {
                final packageOptions = items.map((e) => e.planLabel).toSet().toList()..sort();
                final filtered = applyPackageListFilters(items, _filters);
                return Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: DropdownButtonFormField<String?>(
                                  key: const Key('sa-package-filter-plan'),
                                  initialValue: _filters.packageLabel,
                                  decoration: InputDecoration(
                                    labelText: superAdminPackageFilterPackageAr,
                                    isDense: true,
                                  ),
                                  items: [
                                    DropdownMenuItem<String?>(
                                      value: null,
                                      child: Text(superAdminPackageFilterAllAr),
                                    ),
                                    ...packageOptions.map(
                                      (p) => DropdownMenuItem<String?>(value: p, child: Text(p)),
                                    ),
                                  ],
                                  onChanged: (v) => setState(
                                    () => _filters = _filters.copyWith(
                                      packageLabel: v,
                                      clearPackage: v == null,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: DropdownButtonFormField<PackageIdentityFilter>(
                                  key: const Key('sa-package-filter-identity'),
                                  initialValue: _filters.identity,
                                  decoration: InputDecoration(
                                    labelText: superAdminPackageFilterIdentityAr,
                                    isDense: true,
                                  ),
                                  items: [
                                    DropdownMenuItem(
                                      value: PackageIdentityFilter.all,
                                      child: Text(superAdminPackageFilterAllAr),
                                    ),
                                    DropdownMenuItem(
                                      value: PackageIdentityFilter.verified,
                                      child: Text(superAdminPackageIdentityVerifiedAr),
                                    ),
                                    DropdownMenuItem(
                                      value: PackageIdentityFilter.unverified,
                                      child: Text(superAdminPackageIdentityUnverifiedAr),
                                    ),
                                    DropdownMenuItem(
                                      value: PackageIdentityFilter.pending,
                                      child: Text(superAdminPackageIdentityPendingAr),
                                    ),
                                  ],
                                  onChanged: (v) {
                                    if (v == null) return;
                                    setState(() => _filters = _filters.copyWith(identity: v));
                                  },
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: DropdownButtonFormField<PackageTrainingFilter>(
                                  key: const Key('sa-package-filter-training'),
                                  initialValue: _filters.training,
                                  decoration: InputDecoration(
                                    labelText: superAdminPackageFilterTrainingAr,
                                    isDense: true,
                                  ),
                                  items: [
                                    DropdownMenuItem(
                                      value: PackageTrainingFilter.all,
                                      child: Text(superAdminPackageFilterAllAr),
                                    ),
                                    DropdownMenuItem(
                                      value: PackageTrainingFilter.completed,
                                      child: Text(superAdminPackageTrainingDoneAr),
                                    ),
                                    DropdownMenuItem(
                                      value: PackageTrainingFilter.incomplete,
                                      child: Text(superAdminPackageTrainingIncompleteAr),
                                    ),
                                  ],
                                  onChanged: (v) {
                                    if (v == null) return;
                                    setState(() => _filters = _filters.copyWith(training: v));
                                  },
                                ),
                              ),
                              const SizedBox(width: 8),
                              TextButton(
                                key: const Key('sa-package-filter-reset'),
                                onPressed: _filters.isDefault ? null : _resetFilters,
                                child: Text(tr('إعادة تعيين')),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: filtered.isEmpty
                          ? SuperAdminQueueErrorOrEmpty(
                              isError: false,
                              message: tr('لا يوجد مستقلون مطابقون.'),
                            )
                          : ListView.separated(
                              physics: const AlwaysScrollableScrollPhysics(),
                              padding: const EdgeInsets.all(16),
                              itemCount: filtered.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 10),
                              itemBuilder: (context, index) {
                                final item = filtered[index];
                                return SuperAdminQueueCard(
                                  title: item.displayName ?? item.email ?? tr('مستقل'),
                                  subtitle: [
                                    if (item.email != null) item.email,
                                    trf('الباقة: {0}', [item.planLabel]),
                                    trf('التوثيق: {0}', [item.identityStatusLabel]),
                                    trf('التدريب: {0}', [item.trainingStatusLabel]),
                                  ].whereType<String>().join('\n'),
                                  chip: SuperAdminStatusChip(
                                    label: item.accountStatus == 'active' ? tr('نشط') : tr('غير نشط'),
                                    tone: item.accountStatus == 'active'
                                        ? SuperAdminChipTone.success
                                        : SuperAdminChipTone.neutral,
                                  ),
                                  onTap: () => context.push(AppRoutes.superAdminPackageUserPath(item.id)),
                                );
                              },
                            ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class SuperAdminPackageUserDetailScreen extends ConsumerStatefulWidget {
  const SuperAdminPackageUserDetailScreen({super.key, required this.userId});

  final String userId;

  @override
  ConsumerState<SuperAdminPackageUserDetailScreen> createState() =>
      _SuperAdminPackageUserDetailScreenState();
}

class _SuperAdminPackageUserDetailScreenState extends ConsumerState<SuperAdminPackageUserDetailScreen> {
  bool _promptOpen = false;

  Future<void> _changePlan(SuperAdminFreelancerPackageDetail detail) async {
    if (_promptOpen) return;
    _promptOpen = true;
    final canonical = detail.assignablePlans.where((p) => p.marketplaceTier != null && !p.isLegacy).toList();
    final legacy = detail.assignablePlans.where((p) => p.isLegacy).toList();
    final selected = await showModalBottomSheet<SuperAdminAssignablePlan>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return Directionality(
          textDirection: Directionality.of(context),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.all(16),
            children: [
              Text(tr('تغيير الباقة'), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 12),
              ...canonical.map(
                (p) => ListTile(
                  title: Text('${p.marketplaceTier} — ${p.displayTitle}'),
                  subtitle: p.priceJod != null ? Text(trf('{0} د.أ', [p.priceJod])) : null,
                  onTap: () => Navigator.pop(context, p),
                ),
              ),
              if (legacy.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(superAdminPackageLegacySectionAr,
                    style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textMuted)),
                ...legacy.map(
                  (p) => ListTile(
                    title: Text(p.displayTitle),
                    onTap: () => Navigator.pop(context, p),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
    _promptOpen = false;
    if (selected == null || !mounted) return;
    final ok = await showSuperAdminConfirmDialog(
      context: context,
      title: tr('تأكيد'),
      body: superAdminPackageChangeConfirmAr,
      confirmLabel: superAdminConfirmActionLabelAr,
    );
    if (!ok || !mounted) return;
    try {
      final started = await ref.read(superAdminPackageUserDetailProvider(widget.userId).notifier).assignPlan(
            planId: selected.id,
          );
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminPackageAssignSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(superAdminPackageUserDetailProvider(widget.userId));
    return SuperAdminQueueScaffold(
      title: tr('تفاصيل المستخدم'),
      onRefresh: () => ref.read(superAdminPackageUserDetailProvider(widget.userId).notifier).refreshQuietly(),
      body: async.when(
        loading: () => ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.invalidate(superAdminPackageUserDetailProvider(widget.userId)),
        ),
        data: (detail) {
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              OhCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      detail.displayName ?? detail.email ?? tr('مستقل'),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
                      textAlign: TextAlign.start,
                    ),
                    if (detail.email != null && detail.displayName != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        detail.email!,
                        style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                        textAlign: TextAlign.start,
                      ),
                    ],
                    const SizedBox(height: 12),
                    _PackageDetailRow(label: tr('البريد'), value: detail.email ?? '—'),
                    _PackageDetailRow(label: tr('الباقة'), value: detail.planLabel),
                    _PackageDetailRow(label: tr('التوثيق'), value: detail.identityStatusLabel),
                    _PackageDetailRow(label: tr('التدريب'), value: detail.trainingStatusLabel),
                    if (detail.subscriptionStatus != null)
                      _PackageDetailRow(
                        label: tr('حالة الاشتراك'),
                        value: subscriptionStatusLabelAr(detail.subscriptionStatus),
                      ),
                    if (detail.expiresAt != null)
                      _PackageDetailRow(label: tr('انتهاء'), value: detail.expiresAt!),
                    const SizedBox(height: 4),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: SuperAdminStatusChip(
                        label: detail.accountStatusLabel,
                        tone: detail.accountStatus == 'active'
                            ? SuperAdminChipTone.success
                            : SuperAdminChipTone.neutral,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              OhButton(
                label: tr('تغيير الباقة'),
                onPressed: detail.assignablePlans.isEmpty ? null : () => _changePlan(detail),
              ),
              const SizedBox(height: 10),
              OhButton(
                label: tr('توثيق الحساب'),
                outlined: true,
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(superAdminPackageVerifyUnavailableAr)),
                  );
                },
              ),
              const SizedBox(height: 10),
              OhButton(
                label: tr('إكمال التدريب'),
                outlined: true,
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(superAdminPackageTrainingUnavailableAr)),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

class _PackageDetailRow extends StatelessWidget {
  const _PackageDetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
          ),
          Expanded(
            flex: 3,
            child: Text(value, textAlign: TextAlign.start, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
