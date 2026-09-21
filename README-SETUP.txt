PRINT EASY UPDATED BUILD

1. Open Code.gs and set SHOP_TOKEN to a long random value.
2. Deploy Code.gs as Google Apps Script Web App, Execute as you, access Anyone.
3. Use the same Web App URL in customer/index.html and shop/index.html as APPS_SCRIPT_URL.
4. Replace SHOP_TOKEN in shop/index.html with the same token. Customer token is unused.
5. If the existing deployment URL is reused, create a new deployment/version after saving Code.gs.
6. Set a time-driven Apps Script trigger for cleanupOldFiles() every hour.
7. The Shop Console now uses the server as the source of truth. It polls every 5 seconds. Customer status polls every 3 seconds.
8. Shop files have PDF/image/file icons plus View and Open buttons. PDF preview uses the Google Drive URL; if Drive permissions block iframe preview, use Open in new tab.
9. Browser security prevents a normal website from silently sending jobs to arbitrary local printers. The updated Shop flow opens each file and lets the operator print from the browser, then Mark Printed. A silent/automatic printer requires a local print agent.

Current Apps Script URL:
https://script.google.com/macros/s/AKfycbyRZibfR-KZIp_tRuqKl8vSdG7efhFJ6p3ZRkA9JrwNL8IV7m4I0TC2O6Tlyq1cKs4jwg/exec

IMPORTANT: Do not publish the SHOP_TOKEN in public documentation. It is only a lightweight shop API key; for a public multi-shop product, use proper authentication/backend authorization.
