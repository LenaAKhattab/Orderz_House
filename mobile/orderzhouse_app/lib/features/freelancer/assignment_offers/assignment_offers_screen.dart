import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import 'assignment_offers.dart';
import '../../../core/i18n/i18n.dart';

/// Freelancer: assignment offers — review pay/deadline, accept or reject, see agreed terms, answer pay changes.
class AssignmentOffersScreen extends ConsumerWidget {
  const AssignmentOffersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offers = ref.watch(assignmentOffersProvider);
    return Scaffold(
      appBar: AppBar(title: Text(tr('عروض الإسناد'))),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(assignmentOffersProvider),
        child: offers.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(apiErrorMessage(e, fallback: tr('تعذر تحميل العروض.'))))]),
          data: (list) => list.isEmpty
              ? ListView(children: [Padding(padding: EdgeInsets.all(24), child: Text(tr('لا توجد عروض إسناد.')))])
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => AssignmentOfferCard(offer: list[i]),
                ),
        ),
      ),
    );
  }
}

class AssignmentOfferCard extends ConsumerStatefulWidget {
  const AssignmentOfferCard({super.key, required this.offer});
  final AssignmentOffer offer;

  @override
  ConsumerState<AssignmentOfferCard> createState() => _AssignmentOfferCardState();
}

class _AssignmentOfferCardState extends ConsumerState<AssignmentOfferCard> {
  bool _busy = false;
  String _reason = kOfferRejectReasons.first;

  Future<void> _run(Future<void> Function() fn, String okText) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await fn();
      messenger.showSnackBar(SnackBar(content: Text(okText)));
    } on DioException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(apiErrorMessage(e, fallback: tr('تعذر تنفيذ العملية.')))));
    } finally {
      if (mounted) setState(() => _busy = false);
      ref.invalidate(assignmentOffersProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offer;
    final api = ref.read(assignmentOffersApiProvider);
    final actionable = o.isActionable();
    return Card(
      key: ValueKey('offer-${o.id}'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(o.title, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textInk))),
                Chip(label: Text(o.status == 'pending' && !actionable ? tr('منتهي') : (kOfferStatusLabelsAr[o.status] ?? o.status))),
              ],
            ),
            Text(o.orderCode, textDirection: TextDirection.ltr, style: const TextStyle(color: AppColors.textMuted)),
            const SizedBox(height: 8),
            Text(o.description),
            const SizedBox(height: 8),
            Text(trf('الأجر: {0} {1}', [o.termsAmount ?? o.compensationAmount, o.currency]), style: const TextStyle(fontWeight: FontWeight.w700)),
            if (o.durationValue != null) Text(trf('مدة التنفيذ: {0} {1}', [o.durationValue, o.durationUnit == 'hours' ? tr('ساعة') : o.durationUnit == 'minutes' ? tr('دقيقة') : tr('يوم')])),
            if (actionable && o.expiresAt != null)
              Text(trf('الرد قبل: {0}', [o.expiresAt!.toLocal().toString().substring(0, 16)]), style: const TextStyle(color: AppColors.textMuted)),
            if (o.status == 'accepted' && o.termsVersion != null)
              Text(trf('الشروط المتفق عليها — نسخة {0}', [o.termsVersion]), key: const ValueKey('offer-terms')),
            if (actionable) ...[
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _reason,
                decoration: InputDecoration(labelText: tr('سبب الرفض')),
                items: kOfferRejectReasons.map((r) => DropdownMenuItem(value: r, child: Text(kOfferRejectReasonLabelsAr[r] ?? r))).toList(),
                onChanged: (v) => setState(() => _reason = v ?? _reason),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      key: const ValueKey('offer-accept'),
                      onPressed: _busy ? null : () => _run(() => api.accept(o.id), tr('تم القبول')),
                      child: Text(tr('قبول')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      key: const ValueKey('offer-reject'),
                      onPressed: _busy ? null : () => _run(() => api.reject(o.id, _reason), tr('تم الرفض')),
                      child: Text(tr('رفض')),
                    ),
                  ),
                ],
              ),
            ],
            if (o.pendingChangeId != null) ...[
              const Divider(),
              Text(tr('تعديل مقترح على الشروط'), style: TextStyle(fontWeight: FontWeight.w700)),
              Text('${o.pendingChangeOld} → ${o.pendingChangeNew} JOD — ${o.pendingChangeReason ?? ''}'),
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: _busy ? null : () => _run(() => api.respondToChange(o.pendingChangeId!, approve: true), tr('تمت الموافقة')),
                      child: Text(tr('موافق')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : () => _run(() => api.respondToChange(o.pendingChangeId!, approve: false), tr('تم الرفض')),
                      child: Text(tr('لا أوافق')),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
