import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../profile/presentation/profile_screen.dart';
import 'super_admin_action_center_screen.dart';

class SuperAdminShell extends StatefulWidget {
  const SuperAdminShell({super.key});

  @override
  State<SuperAdminShell> createState() => _SuperAdminShellState();
}

class _SuperAdminShellState extends State<SuperAdminShell> {
  int _index = 0;
  final Set<int> _openedTabs = {0};

  static const _tabs = [
    _SaTab('الرئيسية', Icons.home_outlined, Icons.home_rounded),
    _SaTab('الإشعارات', Icons.notifications_outlined, Icons.notifications_rounded),
    _SaTab('الحساب', Icons.person_outline_rounded, Icons.person_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      body: IndexedStack(
        index: _index,
        children: [
          const SuperAdminActionCenterScreen(),
          _openedTabs.contains(1) ? const NotificationsScreen() : const SizedBox.shrink(),
          _openedTabs.contains(2) ? const ProfileScreen() : const SizedBox.shrink(),
        ],
      ),
      bottomNavigationBar: Material(
        color: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.10),
                blurRadius: 24,
                offset: const Offset(0, -6),
              ),
            ],
          ),
          padding: EdgeInsets.fromLTRB(10, 12, 10, 10 + bottomInset),
          child: Row(
            children: [
              for (var i = 0; i < _tabs.length; i++)
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() {
                      _index = i;
                      _openedTabs.add(i);
                    }),
                    borderRadius: BorderRadius.circular(18),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _index == i ? _tabs[i].selectedIcon : _tabs[i].icon,
                            color: _index == i ? AppColors.primary : AppColors.textMuted,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _tabs[i].label,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: _index == i ? FontWeight.w800 : FontWeight.w600,
                              color: _index == i ? AppColors.primary : AppColors.textMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SaTab {
  const _SaTab(this.label, this.icon, this.selectedIcon);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}
