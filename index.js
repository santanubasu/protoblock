if (!(typeof _ === "function")) {
    global._ = require("underscore");
}
if (!(typeof $ === "function")) {
    global.$ = global.jQuery = require("jquery");
}

require("node-polyfill");

var ObjectPath = require("object-path");
var Observe = require("observe-js");
var extend = require("node.extend");

var arrayPathPattern = /[\[\]]]/g;
var objectPathDelimiterPattern = /\./g;
var backPathPattern = /[^.]+\.\.\.\./g;

var syntax = {
    metaKey:"_m",
    transientKey:"_t"
}

function initialize(options) {
    extend(true, syntax, options.syntax);
}

var Binding = Object.extend({
    template:undefined,
    normalizePath:function(observePath) {
        var objectPath = observePath.replace(arrayPathPattern, ".");
        var length = 0;
        while (length!==objectPath.length) {
            length = objectPath.length;
            objectPath = objectPath.replace(backPathPattern, "");
        }
        return objectPath;
    },
    initialize:function(options) {
        extend(
            true,
            this,
            _.pick(options?options:{}, "injectionKey", "metaKey")
        )
        this.observers = {};
        this.setContext(options.$context);
        return this;
    },
    destroy:function() {
        this.detachObservers();
        if (this.$el) {
            this.detachEventListeners();
            this.$el.remove();
        }
        delete this.$context;
        delete this.$el;
    },
    getRenderModel:function() {
        return this.model;
    },
    getRenderMetadata:function() {
        return this.meta("");
    },
    buildPath:function(parts) {
        if (_.isArray(parts)) {
            return this.normalizePath(parts.join("."));
        }
        else {
            var args = Array.prototype.slice.call(arguments);
            return this.normalizePath(args
                .filter(function(part) {
                    return part&&(part.length>0);
                })
                .join(".")
            );
        }
    },
    buildMetadataPath:function(path) {
        var normalizedPath = this.normalizePath(path);
        var parts = normalizedPath.split(objectPathDelimiterPattern);
        var metadataPath = this.buildPath([
            normalizedPath,
            "..",
            syntax.metaKey,
            _.last(parts)
        ]);
        return metadataPath;
    },
    meta:function(path) {
        if (!path) {
            return {};
        }
        else if (_.isObject(path)) {
            return path[syntax.metaKey]||{};
        }
        else if (_.isString(path)) {
            var metadataPath = this.buildMetadataPath(path);
            return ObjectPath.get(this.model, metadataPath)||{};
        }
    },
    set:function(path, value, root) {
        if (!root) {
            root = this.model;
        }
        if (!path) {
            throw "Path cannot be empty or undefined"
        }
        ObjectPath.set(root, path, value);
    },
    get:function(path, root) {
        if (!root) {
            root = this.model;
        }
        if (_.isUndefined(path)) {
            return undefined;
        }
        return ObjectPath.get(root, path);
    },
    delete:function(path, root) {
        if (!root) {
            root = this.model;
        }
        if (_.isUndefined(path)) {
            throw "Path cannot be empty or undefined"
        }
        ObjectPath.del(root, path);
    },
    setContext:function($context) {
        if ($context&&$context.is(this.$context)) {
            return;
        }
        this.$context = $context;
        if (this.$el) {
            this.attachEventListeners();
        }
        return this;
    },
    attachEventListeners:function() {
        this.detachEventListeners();
    },
    attachAllEventListeners:function() {
        this.attachEventListeners();
    },
    detachEventListeners:function() {
    },
    trigger:function(event, parameters) {
        this.$el.trigger(event, parameters);
    },
    preRender:function() {
        return this;
    },
    render:function() {
        return $();
    },
    postRender:function() {
        this.renderDirect();
        return this;
    },
    renderDirect:function(options) {
    },
    escapeSelectorValue:function(value) {
        return value.replace(/\./g, "\\.");
    },
    inject:function(options) {
        options = extend(true, {}, options);
        var $injectEl;
        if (!this.$context) {
            return;
        }
        if (options.$injectEl) {
            $injectEl = options.$injectEl;
        }
        else {
            $injectEl = this.$el;
        }
        if (!$injectEl) {
            return;
        }
        var $targetEl;

        if (this.injectionKey) {
            var escapedInjectionKey = this.escapeSelectorValue(this.injectionKey);
            $targetEl = this.$context.find("[inject="+escapedInjectionKey+"]").not(this.$context.find("[inject] [inject="+escapedInjectionKey+"]"));
        }
        else {
            $targetEl = this.$el;
        }
        $injectEl.attr("inject", this.injectionKey);
        if ($targetEl&&!$injectEl.is($targetEl)) {
            $targetEl.replaceWith($injectEl);
        }
    },
    skipUpdate:function() {
        this.skipNextUpdate = true;
    },
    update:function(options) {
        if (this.skipNextUpdate) {
            this.skipNextUpdate = false;
            return;
        }
        options = extend(
            true,
            {
                attachEvents:true
            },
            options
        );
        if (!this.model) {
            return;
        }
        var $currentEl = this.$el;
        this.preRender(options);
        var $newEl = this.render(options);
        this.inject({
            $injectEl:$newEl
        });
        this.$el = $newEl;
        this.postRender(options);
        if ($currentEl) {
            $currentEl.remove();
        }

        if (options.attachEvents&&$.contains(document, this.$el[0])) {
            this.attachAllEventListeners();
        }
        return this;
    }
});

var CollectionBinding = Binding.extend({
    itemViewKey:"items",
    itemBinding:undefined,
    itemMixins:{
        inject:function(options) {
            options = extend(true, {}, options);
            var $injectEl;
            if (!this.$context) {
                return;
            }
            if (options.$injectEl) {
                $injectEl = options.$injectEl;
            }
            else {
                $injectEl = this.$el;
            }
            if (!$injectEl) {
                return;
            }
            var escapedInjectionKey = this.escapeSelectorValue(this.injectionKey);
            var $itemsEl = this.$context.find("[inject="+escapedInjectionKey+"]");
            if ("index" in options) {
                $injectEl.insertAfter($itemsEl.eq(options.index));
            }
            else if (this.$el&&!$injectEl.is(this.$el)) {
                this.$el.replaceWith($injectEl);
            }
            else {
                $injectEl.insertAfter($itemsEl.last());
            }
        }
    },
    parseBindingKey:function(key) {
        var parts = key.split(":");
        var modelPath;
        var viewKey;
        if (parts.length===1) {
            modelPath = parts[0];
        }
        else if (parts.length===2) {
            modelPath = parts[0];
            viewKey = parts[1];
        }
        return {
            modelPath:modelPath,
            viewKey:viewKey
        }
    },
    initialize:function(options) {
        options = extend(true, {}, options);
        Binding.initialize.call(this, options);
        this.itemInjectionKey = this.itemViewKey;
        this.bindings = [];
        this.setModel(options.model);
        return this;
    },
    setModel:function(model) {
        if (this.model===model) {
            return;
        }
        if (this.model) {
            this.detachObservers();
        }
        this.model = model;
        if (this.model) {
            this.attachObservers();
            for (var i=0; i<this.bindings.length; i++) {
                this.bindings[i].destroy();
            }
            this.bindings = [];
            this.bindings.length = this.model.length;
            for (var i=0; i<this.model.length; i++) {
                var itemBinding = _.isFunction(this.itemBinding)?this.itemBinding(this.model[i]):this.itemBinding;
                this.bindings[i] = itemBinding
                    .extend({
                        inject:this.itemMixins.inject,
                        injectionKey:this.itemInjectionKey
                    })
                    .initialize({
                        model:this.model[i],
                        $context:this.$el
                    })
            }
        }
        this.update();
        return this;
    },
    // TODO AS written, this will only work correctly for collections that contain row which are objects that are
    // referentially unique,
    observe:function(splices) {
        this.bindings.forEach(function(binding, index) {
            binding.model[syntax.transientKey] = {
                binding:binding,
                index:index
            };
        });
        var newBindings = [];
        var bindings = [];
        bindings.length = this.model.length;
        this.model.forEach(function(itemModel, index) {
            var binding;
            if (itemModel[syntax.transientKey]) {
                binding = itemModel[syntax.transientKey].binding;
                delete itemModel[syntax.transientKey];
            }
            else {
                var itemBindingType = _.isFunction(this.itemBinding)?this.itemBinding(itemModel):this.itemBinding;
                binding = itemBindingType
                    .extend({
                        inject:this.itemMixins.inject,
                        injectionKey:this.itemInjectionKey
                    })
                    .initialize({
                        model:itemModel,
                        $context:this.$el
                    })
                newBindings.push(binding);
            }
            bindings[index] = binding;
        }.bind(this));
        this.bindings.forEach(function(binding, index) {
            if (binding.model[syntax.transientKey]) {
                delete binding.model[syntax.transientKey];
                binding.destroy();
            }
            else {
                delete binding.model[syntax.transientKey];
            }
        });
        this.bindings = bindings;
        this.update({
            attachEvents:false
        });
    },
    attachObservers:function() {
        var itemObserver = new Observe.ArrayObserver(this.model);
        itemObserver.open(this.observe.bind(this));
        this.observers[""] = itemObserver;
        return this;
    },
    detachObservers:function() {
        this.observers[""].close();
        delete this.observers[""];
        return this;
    },
    getDisplayBindings:function() {
        return this.bindings;
    },
    render:function() {
        var $newEl = $(this.template(this.getRenderModel()));
        var displayBindings = this.getDisplayBindings();
        var $itemsEl = $(displayBindings
            .map(function(binding) {
                return binding.$el
            }))
            .map(function () {
                return this.toArray();
            });
        if ($itemsEl.length>0) {
            var escapedItemInjectionKey = this.escapeSelectorValue(this.itemInjectionKey);
            $newEl.find("[inject="+escapedItemInjectionKey+"]").replaceWith($itemsEl);
            for (var i=0; i<this.bindings.length; i++) {
                this.bindings[i].setContext($newEl);
            }
        }
        $newEl.attr("inject", this.injectionKey);
        return $newEl;
    },
    destroy:function() {
        Binding.destroy.call(this);
        for (var i=0; i<this.bindings.length; i++) {
            this.bindings[i].destroy();
        }
    },
    getBinding:function(index) {
        return this.bindings[index];
    },
    attachEventListeners:function() {
        Binding.attachEventListeners.call(this);
        var selector = "[inject='."+this.itemInjectionKey+"'] .-remove-item:not([inject='."+this.itemInjectionKey+"'] [inject='."+this.itemInjectionKey+"'] .-remove-item)";
        this.$el.on("click.remove", selector, function(e) {
            var $item = $(e.target).closest("[inject='."+this.itemInjectionKey+"']");
            var $items = $item.siblings("[inject='."+this.itemInjectionKey+"']");
            var index = $items.index($item);
            this.model.splice(index, 1);
        })
    },
    detachEventListeners:function() {
        Binding.detachEventListeners.call(this);
        // TODO the on() call uses a selector, but this doesn't, which doesn't seem right
        this.$el.off("click.remove");
    },
    attachAllEventListeners:function() {
        if (this.$el) {
            this.attachEventListeners();
        }
        this.bindings.forEach(function(binding) {
            binding.attachAllEventListeners();
        })
    }
});

var ObjectBinding = Binding.extend({
    observedPaths:{},
    parseBindingKey:function(key) {
        var parts = key.split(":");
        var modelPath;
        var viewKey;
        if (parts.length===1) {
            modelPath = parts[0];
        }
        else if (parts.length===2) {
            modelPath = parts[0];
            viewKey = parts[1];
        }
        return {
            modelPath:modelPath,
            viewKey:viewKey
        }
    },
    initialize:function(options) {
        options = options||{};
        Binding.initialize.call(this, options);
        this.bindings = {};
        this.injectionMap = {};
        this.observers.children = {};
        this.observers.self = {};
        this.setModel(options.model);
        return this;
    },
    getRenderModel:function() {
        return this.get("");
    },
    getRenderMetadata:function() {
        return this.meta("");
    },
    setModel:function(model) {
        if (this.model===model) {
            return;
        }
        if (this.model) {
            this.detachObservers();
        }
        this.model = model;
        if (this.model) {
            this.attachObservers();
            for (var modelPath in this.bindings) {
                var model = this.get(modelPath);
                if (model) {
                    for (var viewKey in this.bindings[modelPath]) {
                        this.bindings[modelPath][viewKey].setModel(model);
                    }
                }
            }
        }
        this.update();
        return this;
    },
    addBinding:function(options) {
        options = extend(
            true,
            {
                modelPath:""
            },
            options
        );
        if (options.viewKey) {
            options.binding.injectionKey = options.viewKey;
        }
        else {
            options.binding.injectionKey = options.modelPath;
        }

        if (!(options.modelPath in this.bindings)) {
            this.bindings[options.modelPath] = {};
        }
        if (options.viewKey in this.bindings[options.modelPath]) {
            var currentBinding = this.bindings[options.modelPath][options.viewKey];
            if (currentBinding===options.binding) {
                return;
            }
            else {
                currentBinding.destroy();
            }
        }
        options.binding.setContext(this.$el);
        this.bindings[options.modelPath][options.viewKey] = options.binding;
        this.injectionMap[options.binding.injectionKey] = options.binding;
        if (!options.binding.model&&this.model) {
            options.binding.setModel(this.get(options.modelPath));
        }
        else {
            options.binding.update();
        }
        if (options.modelPath!=="") {
            this.attachChildObserver(options.modelPath);
        }
        return this;
    },
    addBindings:function(bindings) {
        for (var key in bindings) {
            var binding = bindings[key];
            var keyParse = binding.parseBindingKey(key);
            var instance = binding.new(keyParse.options);
            this.addBinding({
                modelPath:keyParse.modelPath,
                viewKey:keyParse.viewKey,
                binding:instance
            });
        }
        return this;
    },
    getBinding:function(key) {
        return this.injectionMap[key];
    },
    attachChildObserver:function(modelPath) {
        this.detachChildObserver(modelPath);
        var pathObserver = new Observe.PathObserver(this.model, modelPath);
        pathObserver.open(this.buildChildObserver({
            modelPath:modelPath
        }));
        this.observers.children[modelPath] = pathObserver;
    },
    attachSelfObserver:function(modelPath, fn) {
        this.detachSelfObserver(modelPath);
        var pathObserver = new Observe.PathObserver(this.model, modelPath);
        pathObserver.open(_.isFunction(fn)?fn.bind(this):this.buildSelfObserver({
            modelPath:modelPath
        }));
        this.observers.self[modelPath] = pathObserver;
    },
    attachObservers:function() {
        for (var modelPath in this.bindings) {
            for (var viewPath in this.bindings[modelPath]) {
                this.attachChildObserver(modelPath);
            }
        }
        for (var observedPath in this.observedPaths) {
            var paths = observedPath.trim().split(/\s+/);
            paths.forEach(function(path) {
                this.attachSelfObserver(path, this.observedPaths[observedPath]);
            }.bind(this))
        }
    },
    detachChildObserver:function(modelPath) {
        if (modelPath in this.observers.children) {
            this.observers.children[modelPath].close();
            delete this.observers.children[modelPath];
        }
    },
    detachSelfObserver:function(modelPath) {
        if (modelPath in this.observers.self) {
            this.observers.self[modelPath].close();
            delete this.observers.self[modelPath];
        }
    },
    detachObservers:function() {
        for (var modelPath in this.observers.children) {
            this.detachChildObserver(modelPath);
        }
        for (var observedPath in this.observers.self) {
            this.detachSelfObserver(observedPath);
        }
    },
    buildChildObserver:function(options) {
        var modelPath = options.modelPath;
        return function(newValue, oldValue) {
            for (var viewKey in this.bindings[modelPath]) {
                console.log("ObjectBinding child observer is setting model at "+modelPath+"."+viewKey);
                this.bindings[modelPath][viewKey].setModel(newValue);
            }
        }.bind(this);
    },
    buildSelfObserver:function(options) {
        var modelPath = options.modelPath;
        return function(newValue, oldValue) {
            this.update();
        }.bind(this);
    },
    render:function() {
        var $newEl = $(this.template(this.getRenderModel(), this.getRenderMetadata()));
        for (var modelPath in this.bindings) {
            for (var viewKey in this.bindings[modelPath]) {
                var binding = this.bindings[modelPath][viewKey];
                binding.setContext($newEl);
                binding.inject();
            }
        }
        $newEl.attr("inject", this.injectionKey);
        return $newEl;
    },
    attachAllEventListeners:function() {
        if (this.$el) {
            this.attachEventListeners();
        }
        for (var modelPath in this.bindings) {
            for (var viewKey in this.bindings[modelPath]) {
                this.bindings[modelPath][viewKey].attachAllEventListeners();
            }
        }
    }
});

var PathBinding = ObjectBinding.extend({
    validationStates:{
        valid:"valid",
        invalid:"invalid"
    },
    parseBindingKey: function (key) {
        var parts = key.split(":");
        var modelPath;
        var viewKey;
        var path;
        if (parts.length === 1) {
            modelPath = "";
            path = parts[0];
            viewKey = parts[0];
        }
        else if (parts.length === 2) {
            modelPath = parts[0];
            path = parts[1];
            viewKey = parts[0] + "." + parts[1];
        }
        else if (parts.length === 3) {
            modelPath = parts[0];
            path = parts[1];
            viewKey = parts[2];
        }
        return {
            modelPath: modelPath,
            viewKey: viewKey,
            options: {
                path: path
            }
        };
    },
    initialize:function(options) {
        options = options||{};
        /*
        TODO
        This is an attempt to allow a type specified value for path to remain in effect even when the options does not
        contain a path property.  This technique is probbaly something that should be generalized and used for any properties
        that can be set across all instances of a type, and can be done so at the type definition stage
         */
        this.path = options.path?options.path:this.path;
        ObjectBinding.initialize.call(this, options);
        return this;
    },
    buildValidationStatePath:function(path) {
        var metadataPath = this.buildMetadataPath(path);
        var validationStatePath = this.buildPath([
            metadataPath,
            "valid.state"
        ])
        return validationStatePath;
    },
    getPathFromModel:function(path) {
        if (path[0]==='.') {
            return this.normalizePath([
                this.path,
                path
            ].join("."));
        }
        else {
            return path;
        }
    },
    attachSelfObserver:function(modelPath) {
        var fullPath = this.getPathFromModel(modelPath);
        ObjectBinding.attachSelfObserver.call(this, fullPath);
    },
    detachSelfObserver:function(modelPath) {
        var fullPath = this.getPathFromModel(modelPath);
        ObjectBinding.detachSelfObserver.call(this, fullPath);
    },
    attachObservers:function() {
        ObjectBinding.attachObservers.call(this);

        var pathObserver = new Observe.PathObserver(this.model, this.path);
        pathObserver.open(this.buildUpdateObserver());
        this.observers.self[this.path] = pathObserver;

        var validationStatePath = this.buildValidationStatePath(this.path);
        var validationObserver = new Observe.PathObserver(this.model, validationStatePath);
        validationObserver.open(this.buildUpdateObserver());
        this.observers.self[validationStatePath] = validationObserver;

        return this;
    },
    detachObservers:function() {
        ObjectBinding.detachObservers.call(this);

        if (this.path in this.observers.self) {
            this.observers.self[this.path].close();
            delete this.observers.self[this.path];
        }

        var validationStatePath = this.buildValidationStatePath(this.path);
        if (validationStatePath in this.observers.self) {
            this.observers.self[validationStatePath].close();
            delete this.observers.self[validationStatePath];
        }

        return this;
    },
    buildUpdateObserver:function(options) {
        return function(newValue, oldValue) {
            this.update();
        }.bind(this);
    },
    getRenderModel:function() {
        return this.get(this.path);
    },
    getRenderMetadata:function() {
        return this.meta(this.path);
    }
});

module.exports = {
    initialize:initialize,
    Binding:Binding,
    PathBinding:PathBinding,
    ObjectBinding:ObjectBinding,
    CollectionBinding:CollectionBinding
}
