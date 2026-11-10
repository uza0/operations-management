package iq.ticketzone.ops;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * The site, in its own window.
 *
 * This app holds nothing. There is no local database, no copy of the roster,
 * no second sign-in: it is the same server, the same session cookie and the
 * same pages, opened in a window that happens to have an icon on the home
 * screen. It exists because a phone without Google services cannot install a
 * web app the ordinary way, and the people it is for are the ones holding
 * those phones.
 *
 * So everything below is plumbing a browser would have done for free —
 * choosing a file, asking for the camera, saving a download with the session
 * cookie attached, going back when the back key is pressed. A WebView does
 * none of it unless an app says so, and each one that is missing shows up as
 * a button on the site that silently does nothing.
 */
public class MainActivity extends Activity {

    /** The only place this app is allowed to be. */
    private static final String SITE = "https://operations-management-two.vercel.app";
    private static final String HOST = "operations-management-two.vercel.app";

    private static final int FILE_REQUEST = 1001;
    private static final int PERMISSION_REQUEST = 1002;

    private WebView web;
    private ValueCallback<Uri[]> pendingFiles;
    /** True while the offline page is showing, so Back returns to the site. */
    private boolean showingError;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        web = new WebView(this);
        setContentView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        /*
         * A marker the site can look for later — to stop offering to install
         * an app to somebody who is already inside one, for instance.
         */
        s.setUserAgentString(s.getUserAgentString() + " TicketZoneOpsApp/1.0");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {

            /*
             * Anything that is not this site leaves the app: a WhatsApp link,
             * a map, a phone number. Keeping them inside would strand the
             * reader in a window with no address bar and no way out.
             */
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handle(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handle(Uri.parse(url));
            }

            private boolean handle(Uri uri) {
                String host = uri.getHost();
                if (host != null && host.equalsIgnoreCase(HOST)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException e) {
                    toast("ما كو تطبيق يفتح هذا الرابط");
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                showingError = false;
            }

            /*
             * Only the page itself is worth an error screen. An image or a
             * script that fails is the site's own business, and replacing the
             * whole window because one of them timed out loses whatever the
             * reader was in the middle of.
             */
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int code, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.equals(view.getUrl())) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {

            /** The camera, for a profile photo taken on the spot. */
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override public void run() { request.grant(request.getResources()); }
                });
            }

            /** Standing in a venue and marking where it is. */
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    pendingFiles = null;
                    toast("ما كو تطبيق يفتح الملفات");
                    return false;
                }
            }
        });

        /*
         * A download from inside a signed-in window is a signed-in download.
         * Handing the URL to the browser would send it without the session
         * cookie, and the payment file would come back as the sign-in page.
         */
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String disposition,
                                        String mime, long size) {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    String cookie = CookieManager.getInstance().getCookie(url);
                    if (cookie != null) request.addRequestHeader("Cookie", cookie);
                    request.addRequestHeader("User-Agent", userAgent);
                    String name = URLUtil.guessFileName(url, disposition, mime);
                    request.setMimeType(mime);
                    request.setTitle(name);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                    request.setNotificationVisibility(
                            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    DownloadManager manager =
                            (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    manager.enqueue(request);
                    toast("جاري التنزيل: " + name);
                } catch (Exception e) {
                    toast("تعذّر التنزيل");
                }
            }
        });

        askForPermissions();

        if (state != null) web.restoreState(state);
        else web.loadUrl(SITE);
    }

    /*
     * Asked once, at the start, rather than at the moment the page needs
     * them: a WebView that is refused mid-flow gives the page nothing to
     * explain, so the button simply stops working and nobody knows why.
     */
    private void askForPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        java.util.List<String> wanted = new java.util.ArrayList<String>();
        String[] all = { Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION };
        for (String permission : all) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                wanted.add(permission);
            }
        }
        if (!wanted.isEmpty()) {
            requestPermissions(wanted.toArray(new String[0]), PERMISSION_REQUEST);
        }
    }

    /**
     * No network, said plainly, with the one control that helps.
     *
     * The retry is an ordinary link back to the site rather than a bridge
     * into Java. A JavascriptInterface stays registered for every page that
     * loads afterwards, and handing the whole site a door into the app to
     * save one button is a trade worth refusing.
     */
    private void showOffline() {
        showingError = true;
        String html =
                "<!doctype html><html dir='rtl' lang='ar'><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>html,body{height:100%;margin:0}"
                + "body{background:#0A0908;color:#E7E2DC;display:flex;align-items:center;"
                + "justify-content:center;font-family:system-ui,sans-serif;text-align:center;padding:24px}"
                + "h1{font-size:19px;margin:0 0 10px}p{font-size:14px;color:#9A938B;margin:0 0 22px;line-height:1.8}"
                + "a{display:inline-block;background:#E4584A;color:#fff;text-decoration:none;"
                + "border-radius:10px;padding:12px 28px;font-size:15px;font-weight:700}</style>"
                + "</head><body><div>"
                + "<h1>ما كو اتصال</h1>"
                + "<p>التطبيق يشتغل على الإنترنت.<br>تأكد من الشبكة وجرّب مرة ثانية.</p>"
                + "<a href='" + SITE + "'>حاول مرة ثانية</a>"
                + "</div></body></html>";
        web.loadDataWithBaseURL(SITE, html, "text/html", "utf-8", null);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == FILE_REQUEST) {
            if (pendingFiles == null) return;
            pendingFiles.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingFiles = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent event) {
        if (code == KeyEvent.KEYCODE_BACK) {
            if (showingError) {
                web.loadUrl(SITE);
                return true;
            }
            if (web.canGoBack()) {
                web.goBack();
                return true;
            }
        }
        return super.onKeyDown(code, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        web.saveState(state);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        /*
         * The promoter's session lasts a year, and it lasts it in a cookie.
         * Android writes cookies out lazily, so a phone killed from the task
         * switcher before the next write signs him out of a session he never
         * ended.
         */
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }
}
