import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const wrappers = [
  'mobile-app/ios/DTPS/MainViewController.swift',
  'Store Apps/ios/Source/ViewController.swift',
];

describe('iOS WebView provider navigation policy', () => {
  it.each(wrappers)('%s keeps Firebase and Razorpay flows inside the app', (relativePath) => {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

    expect(source).toContain('navigationAction.targetFrame?.isMainFrame == false');
    expect(source).toContain('decisionHandler(.allow)');
    expect(source).toContain('"razorpay.com"');
    expect(source).toContain('"google.com"');
    expect(source).toContain('"googleapis.com"');
    expect(source).toContain('"firebaseapp.com"');
    expect(source).toContain('"recaptcha.net"');
    expect(source).toContain('normalizedHost.hasSuffix(".\\($0)")');
    expect(source).not.toContain('host.contains("razorpay.com")');
  });

  it.each(wrappers)('%s handles target-blank provider windows in the existing WebView', (relativePath) => {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

    expect(source).toContain('createWebViewWith configuration: WKWebViewConfiguration');
    expect(source).toContain('navigationAction.targetFrame == nil');
    expect(source).toContain('webView.load(URLRequest(url: url))');
  });
});
