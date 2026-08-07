import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/auth_controller.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../data/financial_claim_models.dart';
import 'done_projects_section.dart';
import 'financial_claim_card.dart';
import 'financial_claims_controller.dart';

class FinancialClaimsScreen extends ConsumerStatefulWidget {
  const FinancialClaimsScreen({super.key});

  @override
  ConsumerState<FinancialClaimsScreen> createState() => _FinancialClaimsScreenState();
}

class _FinancialClaimsScreenState extends ConsumerState<FinancialClaimsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  FinancialClaimFilter _filter = FinancialClaimFilter.all;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _refreshClaims() async {
    ref.invalidate(financialClaimsControllerProvider);
    await ref.read(financialClaimsControllerProvider.future);
  }

  void _switchToClaimsTab() {
    if (_tabController.index != 0) {
      _tabController.animateTo(0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final snapshotAsync = ref.watch(financialClaimsControllerProvider);

    if (!auth.isAuthenticated) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: const Text('مطالباتي المالية')),
        body: const OhEmptyBody(
          message: 'سجّل الدخول كمستقل لعرض مطالباتك المالية.',
          icon: Icons.lock_outline,
        ),
      );
    }

    if (auth.user?.isFreelancerAccount != true) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: const Text('مطالباتي المالية')),
        body: const OhEmptyBody(
          message: 'هذه الصفحة متاحة للمستقلين فقط.',
          icon: Icons.person_off_outlined,
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(
        title: const Text('مطالباتي المالية'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'مطالباتي'),
            Tab(text: 'مشاريع قابلة للمطالبة'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          snapshotAsync.when(
            loading: () => const OhLoadingBody(message: 'جارٍ تحميل المطالبات...'),
            error: (error, _) => OhErrorBody(
              message: 'تعذر تحميل المطالبات. حاول مرة أخرى.',
              onRetry: _refreshClaims,
            ),
            data: (snapshot) => RefreshIndicator(
              onRefresh: _refreshClaims,
              child: _FinancialClaimsBody(
                snapshot: snapshot,
                filter: _filter,
                onFilterChanged: (value) => setState(() => _filter = value),
              ),
            ),
          ),
          DoneProjectsSection(onClaimCreated: _switchToClaimsTab),
        ],
      ),
    );
  }
}

class _FinancialClaimsBody extends StatelessWidget {
  const _FinancialClaimsBody({
    required this.snapshot,
    required this.filter,
    required this.onFilterChanged,
  });

  final FinancialClaimsSnapshot snapshot;
  final FinancialClaimFilter filter;
  final ValueChanged<FinancialClaimFilter> onFilterChanged;

  @override
  Widget build(BuildContext context) {
    final filtered = filterFinancialClaims(snapshot.claims, filter);

    if (snapshot.claims.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: const [
          _SummarySection(
            summary: FinancialClaimsSummary(total: 0, underReview: 0, paid: 0, due: 0),
          ),
          SizedBox(height: 16),
          OhEmptyBody(
            message: 'لا توجد مطالبات مالية حتى الآن',
            icon: Icons.receipt_long_outlined,
          ),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        _SummarySection(summary: snapshot.summary),
        const SizedBox(height: 14),
        _FilterChips(filter: filter, onChanged: onFilterChanged),
        const SizedBox(height: 14),
        if (filtered.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: OhEmptyBody(
              message: 'لا توجد مطالبات في هذا التصنيف.',
              icon: Icons.filter_list_off_outlined,
            ),
          )
        else
          ...filtered.map(
            (claim) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: FinancialClaimCard(claim: claim),
            ),
          ),
      ],
    );
  }
}

class _SummarySection extends StatelessWidget {
  const _SummarySection({required this.summary});

  final FinancialClaimsSummary summary;

  @override
  Widget build(BuildContext context) {
    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'ملخص المطالبات',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 17,
              color: AppColors.textInk,
            ),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 12),
          _SummaryRow(label: 'إجمالي المطالبات', value: '${summary.total}'),
          _SummaryRow(label: 'قيد المراجعة', value: '${summary.underReview}'),
          _SummaryRow(label: 'مدفوعة', value: '${summary.paid}'),
          _SummaryRow(label: 'مستحقة / قابلة للمتابعة', value: '${summary.due}'),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
              fontSize: 16,
            ),
          ),
          const Spacer(),
          Text(
            label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _FilterChips extends StatelessWidget {
  const _FilterChips({required this.filter, required this.onChanged});

  final FinancialClaimFilter filter;
  final ValueChanged<FinancialClaimFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      reverse: true,
      child: Row(
        children: FinancialClaimFilter.values.map((item) {
          final selected = item == filter;
          return Padding(
            padding: const EdgeInsets.only(left: 8),
            child: FilterChip(
              label: Text(financialClaimFilterLabelAr(item)),
              selected: selected,
              onSelected: (_) => onChanged(item),
              selectedColor: AppColors.primary.withValues(alpha: 0.15),
              checkmarkColor: AppColors.primary,
              labelStyle: TextStyle(
                color: selected ? AppColors.primary : AppColors.textInk,
                fontWeight: FontWeight.w700,
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
