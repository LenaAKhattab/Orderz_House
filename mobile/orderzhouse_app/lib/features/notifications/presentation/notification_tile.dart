import 'package:flutter/material.dart';



import '../../../core/theme/app_colors.dart';

import '../../../core/widgets/oh_widgets.dart';

import '../data/notification_models.dart';

import 'notification_open_action.dart';



class NotificationTile extends StatelessWidget {

  const NotificationTile({

    super.key,

    required this.notification,

    required this.onTap,

    this.isMarking = false,

    this.selected = false,

    this.onSelectedChanged,

    this.selectionMode = false,

  });



  final AppNotification notification;

  final VoidCallback? onTap;

  final bool isMarking;

  final bool selected;

  final ValueChanged<bool>? onSelectedChanged;

  final bool selectionMode;



  static const int _previewMaxLength = 120;



  @override

  Widget build(BuildContext context) {

    final preview = _previewMessage(notification.message);

    final displayTitle = notificationDisplayTitle(

      type: notification.type,

      entityType: notification.entityType,

      fallbackTitle: notification.title,

    );

    final typeLabel = notificationTypeLabel(notification.type);

    final dateLabel = formatNotificationDateTime(notification.createdAt);



    return OhCard(

      margin: const EdgeInsets.only(bottom: 10),

      onTap: onTap,

      child: Opacity(

        opacity: isMarking ? 0.65 : 1,

        child: Row(

          crossAxisAlignment: CrossAxisAlignment.start,

          children: [

            if (onSelectedChanged != null)

              Padding(

                padding: const EdgeInsetsDirectional.only(end: 4),

                child: GestureDetector(

                  behavior: HitTestBehavior.opaque,

                  onTap: isMarking

                      ? null

                      : () => onSelectedChanged?.call(!selected),

                  child: SizedBox(

                    width: 48,

                    height: 48,

                    child: Center(

                      child: Checkbox(

                        value: selected,

                        onChanged: isMarking

                            ? null

                            : (value) => onSelectedChanged?.call(value ?? false),

                      ),

                    ),

                  ),

                ),

              ),

            if (notification.isUnread) ...[

              Container(

                width: 8,

                height: 8,

                margin: const EdgeInsets.only(top: 6, left: 4),

                decoration: const BoxDecoration(

                  color: AppColors.primary,

                  shape: BoxShape.circle,

                ),

              ),

              const SizedBox(width: 8),

            ] else if (onSelectedChanged == null)

              const SizedBox(width: 16),

            Expanded(

              child: Column(

                crossAxisAlignment: CrossAxisAlignment.stretch,

                children: [

                  Row(

                    children: [

                      Expanded(

                        child: Text(

                          displayTitle,

                          style: TextStyle(

                            fontWeight:

                                notification.isUnread ? FontWeight.w800 : FontWeight.w700,

                            fontSize: 15,

                          ),

                        ),

                      ),

                      if (notification.isUnread)

                        Container(

                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),

                          decoration: BoxDecoration(

                            color: AppColors.primary.withValues(alpha: 0.12),

                            borderRadius: BorderRadius.circular(8),

                          ),

                          child: const Text(

                            'غير مقروء',

                            style: TextStyle(

                              color: AppColors.primary,

                              fontSize: 11,

                              fontWeight: FontWeight.w700,

                            ),

                          ),

                        ),

                    ],

                  ),

                  const SizedBox(height: 6),

                  Text(

                    preview,

                    maxLines: 3,

                    overflow: TextOverflow.ellipsis,

                    style: const TextStyle(color: AppColors.textMuted, height: 1.5),

                  ),

                  const SizedBox(height: 8),

                  Row(

                    children: [

                      _ChipLabel(label: typeLabel),

                      const Spacer(),

                      Text(

                        dateLabel,

                        style: const TextStyle(color: AppColors.textMuted, fontSize: 12),

                      ),

                    ],

                  ),

                  if (!selectionMode &&

                      notification.message.length > _previewMaxLength) ...[

                    const SizedBox(height: 6),

                    const Align(

                      alignment: Alignment.centerLeft,

                      child: Text(

                        'عرض التفاصيل',

                        style: TextStyle(

                          color: AppColors.primary,

                          fontWeight: FontWeight.w700,

                          fontSize: 12,

                        ),

                      ),

                    ),

                  ],

                ],

              ),

            ),

          ],

        ),

      ),

    );

  }



  String _previewMessage(String message) {

    final trimmed = message.trim();

    if (trimmed.length <= _previewMaxLength) return trimmed;

    return '${trimmed.substring(0, _previewMaxLength)}…';

  }

}



class _ChipLabel extends StatelessWidget {

  const _ChipLabel({required this.label});



  final String label;



  @override

  Widget build(BuildContext context) {

    return Container(

      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),

      decoration: BoxDecoration(

        color: AppColors.iconChipBg,

        borderRadius: BorderRadius.circular(8),

      ),

      child: Text(

        label,

        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.primary),

      ),

    );

  }

}



void showNotificationDetailSheet(

  BuildContext context,

  AppNotification notification, {

  String? currentUserRole,

}) {

  final openTarget = notificationOpenActionTarget(

    notification: notification,

    currentUserRole: currentUserRole,

  );



  showModalBottomSheet<void>(

    context: context,

    isScrollControlled: true,

    showDragHandle: true,

    builder: (context) {

      return Directionality(

        textDirection: TextDirection.rtl,

        child: Padding(

          padding: EdgeInsets.fromLTRB(20, 8, 20, 20 + MediaQuery.paddingOf(context).bottom),

          child: Column(

            mainAxisSize: MainAxisSize.min,

            crossAxisAlignment: CrossAxisAlignment.stretch,

            children: [

              Text(

                notificationDisplayTitle(

                  type: notification.type,

                  entityType: notification.entityType,

                  fallbackTitle: notification.title,

                ),

                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),

              ),

              const SizedBox(height: 8),

              Text(

                notificationTypeLabel(notification.type),

                style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600),

              ),

              const SizedBox(height: 12),

              Text(

                notification.message,

                style: const TextStyle(height: 1.6),

              ),

              const SizedBox(height: 12),

              Text(

                formatNotificationDateTime(notification.createdAt),

                style: const TextStyle(color: AppColors.textMuted),

              ),

              if (notification.actorDisplayName != null) ...[

                const SizedBox(height: 8),

                Text(

                  'من: ${notification.actorDisplayName}',

                  style: const TextStyle(color: AppColors.textMuted, fontSize: 13),

                ),

              ],

              if (openTarget == null &&

                  notification.actionUrl != null &&

                  notification.actionUrl!.trim().isNotEmpty) ...[

                const SizedBox(height: 12),

                const Text(

                  'رابط الإجراء (تشخيصي):',

                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12),

                ),

                const SizedBox(height: 4),

                SelectableText(

                  notification.actionUrl!,

                  textDirection: TextDirection.ltr,

                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),

                ),

              ],

              const SizedBox(height: 16),

              if (openTarget != null) ...[

                OhButton(

                  label: openTarget.buttonLabel,

                  onPressed: () => openNotificationActionTarget(context, openTarget),

                ),

                const SizedBox(height: 10),

              ],

              OhButton(

                label: 'إغلاق',

                outlined: true,

                onPressed: () => Navigator.of(context).pop(),

              ),

            ],

          ),

        ),

      );

    },

  );

}


