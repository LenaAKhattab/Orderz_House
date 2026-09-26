// Debug-only smoke for identity image picker crash investigation + release QA.
// Run: flutter run -t lib/debug/identity_picker_smoke_main.dart -d <device>
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:orderzhouse_app/features/freelancer/account_activation/data/identity_image_picker.dart';

void main() {
  runApp(const MaterialApp(home: _SmokePage()));
}

class _SmokePage extends StatefulWidget {
  const _SmokePage();

  @override
  State<_SmokePage> createState() => _SmokePageState();
}

class _SmokePageState extends State<_SmokePage> {
  String _log = 'ready';
  String? _front;
  String? _back;

  Future<void> _pickLegacy({
    required FileType type,
    required bool allowCompression,
    List<String>? extensions,
  }) async {
    setState(() => _log = 'picking type=$type compression=$allowCompression …');
    try {
      final result = await FilePicker.platform.pickFiles(
        type: type,
        allowMultiple: false,
        withData: false,
        allowCompression: allowCompression,
        compressionQuality: allowCompression ? 30 : 0,
        allowedExtensions: extensions,
      );
      if (result == null || result.files.isEmpty) {
        setState(() => _log = 'cancelled/null');
        return;
      }
      final f = result.files.first;
      setState(() {
        _log =
            'ok name=${f.name} path=${f.path} size=${f.size} bytesNull=${f.bytes == null}';
      });
      if (f.path != null) {
        final exists = File(f.path!).existsSync();
        setState(() => _log = '$_log exists=$exists');
      }
    } catch (e, st) {
      setState(() => _log = 'ERROR $e\n$st');
    }
  }

  Future<void> _pickFixed(bool front) async {
    setState(() => _log = 'picking fixed helper (${front ? 'front' : 'back'}) …');
    final picked = await pickIdentityImageFile();
    if (!mounted) return;
    if (picked.cancelled) {
      setState(() => _log = 'cancelled/null');
      return;
    }
    if (!picked.isSuccess) {
      setState(() => _log = 'error=${picked.errorMessageAr}');
      return;
    }
    setState(() {
      if (front) {
        _front = picked.fileName;
      } else {
        _back = picked.fileName;
      }
      _log =
          'ok side=${front ? 'front' : 'back'} name=${picked.fileName} path=${picked.file!.path} size=${picked.file!.lengthSync()} front=$_front back=$_back';
    });
  }

  Future<void> _validateSynthetic({
    required String name,
    required int size,
  }) async {
    final dir = await Directory.systemTemp.createTemp('oh_id_qa_');
    final file = File('${dir.path}${Platform.pathSeparator}$name');
    await file.writeAsBytes(List<int>.filled(size.clamp(1, 64 * 1024), 7));
    final r = await validateIdentityPickedFile(
      name: name,
      path: file.path,
      reportedSize: size,
    );
    setState(() {
      _log = r.isSuccess
          ? 'synthetic_ok name=$name size=$size'
          : 'synthetic_error=${r.errorMessageAr}';
    });
    try {
      await dir.delete(recursive: true);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('KYC picker smoke')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ElevatedButton(
              onPressed: () => _pickLegacy(type: FileType.image, allowCompression: true),
              child: const Text('A: FileType.image + compression ON (legacy KYC)'),
            ),
            ElevatedButton(
              onPressed: () => _pickLegacy(type: FileType.image, allowCompression: false),
              child: const Text('B: FileType.image + compression OFF'),
            ),
            ElevatedButton(
              onPressed: () => _pickLegacy(
                type: FileType.custom,
                allowCompression: false,
                extensions: identityImageAllowedExtensions,
              ),
              child: const Text('C: FileType.custom jpg/png/webp (fix)'),
            ),
            ElevatedButton(
              onPressed: () => _pickFixed(true),
              child: const Text('D: pickIdentityImageFile FRONT'),
            ),
            ElevatedButton(
              onPressed: () => _pickFixed(false),
              child: const Text('E: pickIdentityImageFile BACK'),
            ),
            ElevatedButton(
              onPressed: () => _validateSynthetic(name: 'too_big.png', size: identityImageMaxBytes + 1),
              child: const Text('F: synthetic >5MB reject'),
            ),
            ElevatedButton(
              onPressed: () => _validateSynthetic(name: 'id.heic', size: 1200),
              child: const Text('G: synthetic HEIC reject'),
            ),
            const SizedBox(height: 16),
            Expanded(child: SingleChildScrollView(child: Text(_log))),
          ],
        ),
      ),
    );
  }
}
