function doGet(event) {
  const parameters = (event && event.parameter) || {};
  const mode = ['pin', 'activate'].includes(parameters.mode) ? parameters.mode : 'kiosk';
  const template = HtmlService.createTemplateFromFile('Index');
  template.bootstrap = JSON.stringify({
    mode,
    token: String(parameters.token || ''),
    title: APP.title,
    teamName: APP.teamName,
    idleResetSeconds: APP.idleResetSeconds,
    successResetSeconds: APP.successResetSeconds
  });
  return template.evaluate()
    .setTitle(APP.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
