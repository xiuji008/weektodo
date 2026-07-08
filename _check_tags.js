const fs = require('fs');
['src/components/listHeader.vue', 'src/components/weeklySummary.vue'].forEach(file => {
  const c = fs.readFileSync(file, 'utf8');
  const tpl = c.match(/<template>([\s\S]*)<\/template>/);
  if (tpl) {
    const template = tpl[1];
    const inputNoClose = template.match(/<input[^>]*[^/]>/g);
    if (inputNoClose) { console.log(file + ': input without self-close:', inputNoClose.length); }
    const hrNoClose = template.match(/<hr[^>]*[^/]>/g);
    if (hrNoClose) { console.log(file + ': hr without self-close:', hrNoClose.length); }
    // Check for < followed by letters but no >
    const unclosedTags = template.match(/<\w+[^>]*$/m);
    if (unclosedTags) { console.log(file + ': possible unclosed tag at line end:', unclosedTags[0].slice(0, 50)); }
  }
});
console.log('Done');
