var _ = require("underscore");
var fs = require("fs");
var dot = require("dot");
var glob = require("glob");

function compileTemplates(options) {
    var files = glob.sync(options.root+"/**/*.jst")
    files.forEach(function(path) {
        var source = fs.readFileSync(path, "utf-8");
        var compiledTemplateSource = dot.template(
            source,
            _.extend({}, dot.templateSettings, {
                varname:"it, blocks"
            }),
            options.defs
        )
        fs.writeFileSync(path.replace(".jst", ".js"), "module.exports = "+compiledTemplateSource)
    });
}

compileTemplates({
    root:process.cwd()
});