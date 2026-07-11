import 'package:url_launcher/url_launcher.dart';

import '../constants/web_constants.dart';

class FreelancerPlansWebLaunchResult {
  const FreelancerPlansWebLaunchResult({required this.launched, required this.url});

  final bool launched;
  final String url;
}

/// Opens freelancer plans/subscription page on the public web app (external browser).
Future<FreelancerPlansWebLaunchResult> launchFreelancerPlansOnWeb() async {
  final url = WebConstants.freelancerPlansUrl;
  final uri = Uri.tryParse(url);
  if (uri == null || !(uri.scheme == 'https' || uri.scheme == 'http')) {
    return FreelancerPlansWebLaunchResult(launched: false, url: url);
  }

  final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
  return FreelancerPlansWebLaunchResult(launched: launched, url: url);
}
