import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/files/file_download_service.dart';
import '../../../core/files/order_file_download_paths.dart';
import '../../../core/theme/app_colors.dart';
import '../data/order_file_models.dart';

class OrderFileDownloadTile extends ConsumerStatefulWidget {
  const OrderFileDownloadTile({
    super.key,
    required this.orderId,
    required this.role,
    required this.file,
  });

  final String orderId;
  final OrderFileDownloadRole role;
  final OrderFileDescriptor file;

  @override
  ConsumerState<OrderFileDownloadTile> createState() => _OrderFileDownloadTileState();
}

class _OrderFileDownloadTileState extends ConsumerState<OrderFileDownloadTile> {
  bool _isLoading = false;

  Future<void> _openFile() async {
    if (_isLoading) return;
    setState(() => _isLoading = true);
    try {
      await ref.read(fileDownloadServiceProvider).downloadAndOpen(
            role: widget.role,
            orderId: widget.orderId,
            fileId: widget.file.id,
            originalName: widget.file.displayName,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('تم فتح الملف: ${widget.file.displayName}')),
      );
    } catch (e) {
      if (!mounted) return;
      final message = e is DioException
          ? orderFileDownloadErrorMessage(e)
          : (e is StateError ? e.message : 'تعذر فتح الملف.');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          const Icon(Icons.insert_drive_file_outlined, size: 18, color: AppColors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              widget.file.displayName,
              style: const TextStyle(color: AppColors.textInk, fontSize: 13, height: 1.35),
              textAlign: TextAlign.right,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: _isLoading ? null : _openFile,
            child: _isLoading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('فتح'),
          ),
        ],
      ),
    );
  }
}
