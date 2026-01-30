class FancyReporter {
  onRunComplete(_, results) {
    const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
    const line = '+-----------------------------------+-------+-------+-------+\n';
    let out = '\n' +
      'Backend Test Results\n' +
      '====================\n' +
      line +
      '| ' + pad('File', 33) + ' | Pass | Fail | Skip |\n' +
      line;
    for (const test of results.testResults) {
      const file = test.testFilePath.split('/tests/').pop() || test.testFilePath;
      out += `| ${pad(file, 33)} | ${pad(String(test.numPassingTests), 5)} | ${pad(String(test.numFailingTests), 5)} | ${pad(String(test.numPendingTests), 5)} |\n`;
    }
    out += line;
    out += `Total: pass=${results.numPassedTests} fail=${results.numFailedTests} skip=${results.numPendingTests}\n`;
    // eslint-disable-next-line no-console
    console.log(out);
  }
}

module.exports = FancyReporter;


