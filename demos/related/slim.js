;(function(window, document, HTMLElement) {
  const _$ = '_slim_internals_' // Symbol('Slim')

  let __SLIM_ALREADY_DEFINED__ = false

  try {
    const {Slim} = window
    if (!!Slim && !!Slim[_$]) {
      __SLIM_ALREADY_DEFINED__ = true
      const warn = console.warn || console.log
      return warn(
        'Multiple instances of slim.js found! This may cause conflicts'
      )
    }
  } catch (err) {}

  const __flags = {
    isWCSupported:
    'customElements' in window &&
    'import' in document.createElement('link') &&
    'content' in document.createElement('template'),
    isIE11: !!window['MSInputMethodContext'] && !!document['documentMode'],
    isChrome: undefined,
    isEdge: undefined,
    isSafari: undefined,
    isFirefox: undefined,
  }

  try {
    __flags.isChrome = /Chrome/.test(navigator.userAgent)
    __flags.isEdge = /Edge/.test(navigator.userAgent)
    __flags.isSafari = /Safari/.test(navigator.userAgent)
    __flags.isFirefox = /Firefox/.test(navigator.userAgent)

    if (__flags.isIE11 || __flags.isEdge) {
      __flags.isChrome = false
      Object.defineProperty(Node.prototype, 'children', function() {
        return this.childNodes
      })
    }
  } catch (err) {}

  class Internals {
    constructor() {
      this.hasCustomTemplate = undefined
      this.boundParent = null
      this.repeater = {}
      this.bindings = {}
      this.reversed = {}
      this.inbounds = {}
      this.eventHandlers = {}
      this.internetExploderClone = null
      this.rootElement = null
      this.createdCallbackInvoked = false
      this.sourceText = null
      this.excluded = false
      this.autoBoundAttributes = []
    }
  }

  class Slim extends HTMLElement {
    static dashToCamel(dash) {
      return dash.indexOf('-') < 0
        ? dash
        : dash.replace(/-[a-z]/g, m => {
          return m[1].toUpperCase()
        })
    }
    static camelToDash(camel) {
      return camel.replace(/([A-Z])/g, '-$1').toLowerCase()
    }

    static get rxInject() {
      return /\{(.+[^(\((.+)\))])\}/ // eslint-disable-line
    }
    static get rxProp() {
      return /(.+[^(\((.+)\))])/ // eslint-disable-line
    }
    static get rxMethod() {
      return /(.+)(\((.+)\)){1}/ // eslint-disable-line
    }
    static lookup(target, expression, maybeRepeated) {
      const chain = expression.split('.')
      let o
      if (maybeRepeated && maybeRepeated[_$].repeater[chain[0]]) {
        o = maybeRepeated[_$].repeater
      } else {
        o = target
      }
      let i = 0
      while (o && i < chain.length) {
        o = o[chain[i++]]
      }
      return o
    }

    // noinspection JSUnresolvedVariable
    static _$(target) {
      target[_$] = target[_$] || new Internals()
      return target[_$]
    }
    static polyFill(url) {
      if (!__flags.isWCSupported) {
        const existingScript = document.querySelector(
          'script[data-is-slim-polyfill="true"]'
        )
        if (!existingScript) {
          const script = document.createElement('script')
          script.setAttribute('data-is-slim-polyfill', 'true')
          script.src = url
          document.head.appendChild(script)
        }
      }
    }
    static tag(tagName, tplOrClazz, clazz) {
      if (this.tagToClassDict.has(tagName)) {
        throw new Error(`Unable to define tag: ${tagName} already defined`)
      }
      if (clazz === undefined) {
        clazz = tplOrClazz
      } else {
        Slim.tagToTemplateDict.set(tagName, tplOrClazz)
      }
      this.tagToClassDict.set(tagName, clazz)
      this.classToTagDict.set(clazz, tagName)
      customElements.define(tagName, clazz)
    }

    static tagOf(clazz) {
      return this.classToTagDict.get(clazz)
    }

    static classOf(tag) {
      return this.tagToClassDict.get(tag)
    }

    static createUniqueIndex() {
      this[_$].uniqueCounter++
      return this[_$].uniqueCounter.toString(16)
    }

    static plugin(phase, plugin) {
      if (!this.plugins[phase]) {
        throw new Error(
          `Cannot attach plugin: ${phase} is not a supported phase`
        )
      }
      this.plugins[phase].push(plugin)
    }

    static checkCreationBlocking(element) {
      if (element.attributes) {
        for (let i = 0, n = element.attributes.length; i < n; i++) {
          const attribute = element.attributes[i]
          for (let [test, directive] of Slim[_$].customDirectives) {
            const value = directive.isBlocking && test(attribute)
            if (value) {
              return true
            }
          }
        }
      }
      return false
    }

    static customDirective(testFn, fn, isBlocking) {
      if (this[_$].customDirectives.has(testFn)) {
        throw new Error(
          `Cannot register custom directive: ${testFn} already registered`
        )
      }
      fn.isBlocking = isBlocking
      this[_$].customDirectives.set(testFn, fn)
    }

    static executePlugins(phase, target) {
      this.plugins[phase].forEach(fn => {
        fn(target)
      })
    }

    static qSelectAll(target, selector) {
      return [...target.querySelectorAll(selector)]
    }

    static unbind(source, target) {
      const bindings = source[_$].bindings
      Object.keys(bindings).forEach(key => {
        const chain = bindings[key].chain.filter(
          binding => binding.target !== target
        )
        bindings[key].chain = chain
      })
    }

    static root(target) {
      return target.__isSlim && target.useShadow
        ? target[_$].rootElement || target
        : target
    }

    static selectRecursive(target, force) {
      const collection = []
      const search = function(node, force) {
        collection.push(node)
        const allow =
          !node.__isSlim ||
          (node.__isSlim && !node.template) ||
          (node.__isSlim && node === target) ||
          force
        if (allow) {
          const children = [...Slim.root(node).children]
          children.forEach(childNode => {
            search(childNode, force)
          })
        }
      }
      search(target, force)
      return collection
    }

    static removeChild(target) {
      if (typeof target.remove === 'function') {
        target.remove()
      }
      if (target.parentNode) {
        target.parentNode.removeChild(target)
      }
      if (this._$(target).internetExploderClone) {
        this.removeChild(this._$(target).internetExploderClone)
      }
    }

    static moveChildren(source, target) {
      while (source.firstChild) {
        target.appendChild(source.firstChild)
      }
    }

    static wrapGetterSetter(element, expression) {
      const pName = expression.split('.')[0]
      let oSetter = element.__lookupSetter__(pName)
      if (oSetter && oSetter[_$]) return pName
      if (typeof oSetter === 'undefined') {
        oSetter = () => {}
      }

      const srcValue = element[pName]
      this._$(element).bindings[pName] = element[_$].bindings[pName] || {
        chain: [],
        value: srcValue,
      }
      element[_$].bindings[pName].value = srcValue
      const newSetter = function(v) {
        oSetter.call(element, v)
        this[_$].bindings[pName].value = v
        this._executeBindings(pName)
      }
      newSetter[_$] = true
      element.__defineGetter__(pName, () => element[_$].bindings[pName].value)
      element.__defineSetter__(pName, newSetter)
      return pName
    }

    static bindOwn(target, expression, executor) {
      return Slim.bind(target, target, expression, executor)
    }

    static bind(source, target, expression, executor) {
      Slim._$(source)
      Slim._$(target)
      if (target[_$].excluded) return
      executor.source = source
      executor.target = target
      const pName = this.wrapGetterSetter(source, expression)
      if (!source[_$].reversed[pName]) {
        source[_$].bindings[pName].chain.push(executor)
      }
      target[_$].inbounds[pName] = target[_$].inbounds[pName] || []
      target[_$].inbounds[pName].push(executor)
      return executor
    }

    static update(target, ...props) {
      const children = Slim.selectRecursive(target)
      if (props.length === 0) {
        return children.forEach(child => {
          Slim.commit(child)
        })
      }
      props.forEach(prop => {
        children.forEach(child => {
          Slim.commit(child, prop)
        })
      })
    }

    static commit(target, prop) {
      let $ = target[_$]
      let chain = []
      if (prop) {
        if ($.inbounds[prop]) {
          chain = chain.concat($.inbounds[prop] || [])
        }
        if ($.bindings[prop]) {
          chain = chain.concat($.bindings[prop].chain)
        }
      } else {
        Object.keys(target[_$].inbounds).forEach(prop => {
          if ($.inbounds[prop]) {
            chain = chain.concat($.inbounds[prop] || [])
          }
          if ($.bindings[prop]) {
            chain = chain.concat($.bindings[prop].chain)
          }
        })
      }
      chain.forEach(x => x())
    }

    /*
      Class instance
      */

    constructor() {
      super()
      const init = () => {
        this.__isSlim = true
        Slim.debug('ctor', this.localName)
        if (Slim.checkCreationBlocking(this)) {
          return
        }
        this.createdCallback()
      }
      if (__flags.isSafari) {
        Slim.asap(init)
      } else init()
    }

    // Native DOM Api V1

    createdCallback() {
      if (this[_$] && this[_$].createdCallbackInvoked) return
      this._initialize()
      this[_$].createdCallbackInvoked = true
      this.onBeforeCreated()
      Slim.executePlugins('create', this)
      this.render()
      this.onCreated()
    }

    // Native DOM Api V2

    connectedCallback() {
      this.onAdded()
      Slim.executePlugins('added', this)
    }

    disconnectedCallback() {
      this.onRemoved()
      Slim.executePlugins('removed', this)
    }

    attributeChangedCallback(attr, oldValue, newValue) {
      if (newValue !== oldValue && this.autoBoundAttributes.includes[attr]) {
        const prop = Slim.dashToCamel(attr)
        this[prop] = newValue
      }
    }
    // Slim internal API

    _executeBindings(prop) {
      Slim.debug('_executeBindings', this.localName)
      let all = this[_$].bindings
      if (prop) {
        all = {[prop]: true}
      }
      Object.keys(all).forEach(pName => {
        const o = this[_$].bindings[pName]
        o && o.chain.forEach(binding => binding())
      })
    }

    _bindChildren(children) {
      Slim.debug('_bindChildren', this.localName)
      if (!children) {
        children = Slim.qSelectAll(this, '*')
      }
      for (let child of children) {
        Slim._$(child)
        if (child[_$].boundParent === this) continue
        child[_$].boundParent = child[_$].boundParent || this

        // todo: child.localName === 'style' && this.useShadow -> processStyleNodeInShadowMode

        if (child.attributes.length) {
          let i = 0
          let n = child.attributes.length
          while (i < n) {
            const source = this
            const attribute = child.attributes.item(i)
            if (!child[_$].excluded) {
              for (let [check, directive] of Slim[_$].customDirectives) {
                const match = check(attribute)
                if (match) {
                  directive(source, child, attribute, match)
                }
              }
            }
            i++
          }
        }
      }
    }

    _resetBindings() {
      Slim.debug('_resetBindings', this.localName)
      this[_$].bindings = {}
    }

    _render(customTemplate) {
      Slim.debug('_render', this.localName)
      Slim.executePlugins('beforeRender', this)
      this[_$].hasCustomTemplate = customTemplate
      this._resetBindings()
      this[_$].rootElement.innerHTML = ''
      ;[...this.childNodes].forEach(childNode => {
        if (childNode.localName === 'style') {
          this[_$].externalStyle = childNode
          childNode.remove()
        }
      })
      const template = this[_$].hasCustomTemplate || this.template
      if (template && typeof template === 'string') {
        const frag = document.createElement('slim-root-fragment')
        frag.innerHTML = template || ''
        const scopedChildren = Slim.qSelectAll(frag, '*')
        if (this[_$].externalStyle) {
          this._bindChildren([this[_$].externalStyle])
        }
        this._bindChildren(scopedChildren)
        Slim.asap(() => {
          Slim.moveChildren(frag, this[_$].rootElement || this)
          this[_$].externalStyle &&
          this[_$].rootElement.appendChild(this[_$].externalStyle)
          this._executeBindings()
          this.onRender()
          Slim.executePlugins('afterRender', this)
        })
      }
    }

    _initialize() {
      Slim.debug('_initialize', this.localName)
      Slim._$(this)
      this[_$].uniqueIndex = Slim.createUniqueIndex()
      if (this.useShadow) {
        if (typeof HTMLElement.prototype.attachShadow === 'undefined') {
          this[_$].rootElement = this.createShadowRoot()
        } else {
          this[_$].rootElement = this.attachShadow({mode: 'open'})
        }
      } else {
        this[_$].rootElement = this
      }
      // this.setAttribute('slim-uq', this[_$].uniqueIndex)
      const observedAttributes = this.constructor.observedAttributes
      if (observedAttributes) {
        observedAttributes.forEach(attr => {
          const pName = Slim.dashToCamel(attr)
          this[pName] = this.getAttribute(attr)
        })
      }
    }

    // Slim public / protected API

    get autoBoundAttributes() {
      return []
    }

    commit(...args) {
      Slim.commit(this, ...args)
    }

    update(...args) {
      Slim.update(this, ...args)
    }

    render(tpl) {
      this._render(tpl)
    }

    onRender() {}
    onBeforeCreated() {}
    onCreated() {}
    onAdded() {}
    onRemoved() {}

    find(selector) {
      return this[_$].rootElement.querySelector(selector)
    }

    findAll(selector) {
      return Slim.qSelectAll(this[_$].rootElement, selector)
    }

    callAttribute(attr, data) {
      const fnName = this.getAttribute(attr)
      if (fnName) {
        return this[_$].boundParent[fnName](data)
      }
    }

    get useShadow() {
      return false
    }

    get template() {
      return Slim.tagToTemplateDict.get(Slim.tagOf(this.constructor))
    }
  }
  Slim.uniqueIndex = 0
  Slim.tagToClassDict = new Map()
  Slim.classToTagDict = new Map()
  Slim.tagToTemplateDict = new Map()
  Slim.plugins = {
    create: [],
    added: [],
    beforeRender: [],
    afterRender: [],
    removed: [],
  }

  Slim.debug = () => {}

  Slim.asap =
    window && window.requestAnimationFrame
      ? cb => window.requestAnimationFrame(cb)
      : typeof setImmediate !== 'undefined'
      ? setImmediate
      : cb => setTimeout(cb, 0)

  Slim[_$] = {
    customDirectives: new Map(),
    uniqueCounter: 0,
    supportedNativeEvents: [
      'click',
      'mouseover',
      'mouseout',
      'mousemove',
      'mouseenter',
      'mousedown',
      'mouseup',
      'dblclick',
      'contextmenu',
      'wheel',
      'mouseleave',
      'select',
      'pointerlockchange',
      'pointerlockerror',
      'focus',
      'blur',
      'input',
      'error',
      'invalid',
      'animationstart',
      'animationend',
      'animationiteration',
      'reset',
      'submit',
      'resize',
      'scroll',
      'keydown',
      'keypress',
      'keyup',
      'change',
    ],
  }

  Slim.customDirective(
    attr => attr.nodeName === 's:switch',
    (source, target, attribute) => {
      const expression = attribute.value
      let oldValue
      const anchor = document.createComment(`switch:${expression}`)
      target.appendChild(anchor)
      const children = [...target.children]
      const defaultChildren = children.filter(child =>
        child.hasAttribute('s:default')
      )
      const fn = () => {
        let value = Slim.lookup(source, expression, target)
        if (String(value) === oldValue) return
        let useDefault = true
        children.forEach(child => {
          if (child.getAttribute('s:case') === String(value)) {
            if (child.__isSlim) {
              child.createdCallback()
            }
            anchor.parentNode.insertBefore(child, anchor)
            useDefault = false
          } else {
            Slim.removeChild(child)
          }
        })
        if (useDefault) {
          defaultChildren.forEach(child => {
            if (child.__isSlim) {
              child.createdCallback()
            }
            anchor.parentNode.insertBefore(child, anchor)
          })
        } else {
          defaultChildren.forEach(child => {
            Slim.removeChild(child)
          })
        }
        oldValue = String(value)
      }
      Slim.bind(source, target, expression, fn)
    }
  )

  Slim.customDirective(attr => /^s:case$/.exec(attr.nodeName), () => {}, true)
  Slim.customDirective(
    attr => /^s:default$/.exec(attr.nodeName),
    () => {},
    true
  )

  // supported events (i.e. click, mouseover, change...)
  Slim.customDirective(
    attr => Slim[_$].supportedNativeEvents.indexOf(attr.nodeName) >= 0,
    (source, target, attribute) => {
      const eventName = attribute.nodeName
      const delegate = attribute.value
      Slim._$(target).eventHandlers = target[_$].eventHandlers || {}
      const allHandlers = target[_$].eventHandlers
      allHandlers[eventName] = allHandlers[eventName] || []
      let handler = e => {
        try {
          source[delegate].call(source, e) // eslint-disable-line
        } catch (err) {
          err.message = `Could not respond to event "${eventName}" on ${
            target.localName
            } -> "${delegate}" on ${source.localName} ... ${err.message}`
          console.warn(err)
        }
      }
      allHandlers[eventName].push(handler)
      target.addEventListener(eventName, handler)
      handler = null
    }
  )

  Slim.customDirective(
    attr => attr.nodeName === 's:if',
    (source, target, attribute) => {
      let expression = attribute.value
      let path = expression
      let isNegative = false
      if (path.charAt(0) === '!') {
        path = path.slice(1)
        isNegative = true
      }
      let oldValue
      const anchor = document.createComment(`if:${expression}`)
      target.parentNode.insertBefore(anchor, target)
      const fn = () => {
        let value = !!Slim.lookup(source, path, target)
        if (isNegative) {
          value = !value
        }
        if (value === oldValue) return
        if (value) {
          if (target.__isSlim) {
            target.createdCallback()
          }
          anchor.parentNode.insertBefore(target, anchor.nextSibling)
        } else {
          Slim.removeChild(target)
        }
        oldValue = value
      }
      Slim.bind(source, target, path, fn)
    },
    true
  )

  // bind (text nodes)
  Slim.customDirective(
    attr => attr.nodeName === 'bind',
    (source, target) => {
      Slim._$(target)
      target[_$].sourceText = target.innerText.split('\n').join(' ')
      let updatedText = ''
      const matches = target.innerText.match(/\{\{([^\}\}]+)+\}\}/g) // eslint-disable-line
      const aggProps = {}
      const textBinds = {}
      if (matches) {
        matches.forEach(expression => {
          let oldValue
          const rxM = /\{\{(.+)(\((.+)\)){1}\}\}/.exec(expression)
          if (rxM) {
            const fnName = rxM[1]
            const pNames = rxM[3]
              .split(' ')
              .join('')
              .split(',')
            pNames
              .map(path => path.split('.')[0])
              .forEach(p => (aggProps[p] = true))
            textBinds[expression] = target => {
              const args = pNames.map(path => Slim.lookup(source, path, target))
              const fn = source[fnName]
              const value = fn ? fn.apply(source, args) : undefined
              if (oldValue === value) return
              updatedText = updatedText.split(expression).join(value || '')
            }
            return
          }
          const rxP = /\{\{(.+[^(\((.+)\))])\}\}/.exec(expression) // eslint-disable-line
          if (rxP) {
            const path = rxP[1]
            aggProps[path] = true
            textBinds[expression] = target => {
              const value = Slim.lookup(source, path, target)
              if (oldValue === value) return
              updatedText = updatedText.split(expression).join(value || '')
            }
          }
        })
        const chainExecutor = () => {
          updatedText = target[_$].sourceText
          Object.keys(textBinds).forEach(expression => {
            textBinds[expression](target)
          })
          target.innerText = updatedText
        }
        Object.keys(aggProps).forEach(prop => {
          Slim.bind(source, target, prop, chainExecutor)
        })
      }
    }
  )

  Slim.customDirective(
    attr => attr.nodeName === 's:id',
    (source, target, attribute) => {
      Slim._$(target).boundParent[attribute.value] = target
    }
  )

  const wrappedRepeaterExecution = (source, templateNode, attribute) => {
    let path = attribute.nodeValue
    let tProp = 'data'
    if (path.indexOf(' as')) {
      tProp = path.split(' as ')[1] || tProp
      path = path.split(' as ')[0]
    }

    const repeater = document.createElement('slim-repeat')
    repeater[_$].boundParent = source
    repeater.dataProp = tProp
    repeater.dataPath = attribute.nodeValue
    repeater.templateNode = templateNode.cloneNode(true)
    repeater.templateNode.removeAttribute('s:repeat')
    templateNode.parentNode.insertBefore(repeater, templateNode)
    Slim.removeChild(templateNode)
    Slim.bind(source, repeater, path, () => {
      const dataSource = Slim.lookup(source, path)
      repeater.dataSource = dataSource || []
    })
  }

  // bind:property
  Slim.customDirective(
    attr => /^(bind):(\S+)/.exec(attr.nodeName),
    (source, target, attribute, match) => {
      const tAttr = match[2]
      const tProp = Slim.dashToCamel(tAttr)
      const expression = attribute.value
      let oldValue
      const rxM = Slim.rxMethod.exec(expression)
      if (rxM) {
        const pNames = rxM[3]
          .split(' ')
          .join('')
          .split(',')
        pNames.forEach(pName => {
          Slim.bind(source, target, pName, () => {
            const fn = Slim.lookup(source, rxM[1], target)
            const args = pNames.map(prop => Slim.lookup(source, prop, target))
            const value = fn.apply(source, args)
            if (oldValue === value) return
            target[tProp] = value
            target.setAttribute(tAttr, value)
          })
        })
        return
      }
      const rxP = Slim.rxProp.exec(expression)
      if (rxP) {
        const prop = rxP[1]
        Slim.bind(source, target, prop, () => {
          const value = Slim.lookup(source, expression, target)
          if (oldValue === value) return
          target.setAttribute(tAttr, value)
          target[tProp] = value
        })
      }
    }
  )

  if (__flags.isChrome || __flags.isSafari || __flags.isFirefox) {
    Slim.customDirective(
      attr => attr.nodeName === 's:repeat',
      (source, templateNode, attribute) => {
        if (__flags.isFirefox) {
          if (
            ['option', 'td', 'tr', 'th'].indexOf(templateNode.localName) < 0
          ) {
            return wrappedRepeaterExecution(source, templateNode, attribute)
          }
        }
        let path = attribute.value
        let tProp = 'data'
        if (path.indexOf(' as')) {
          tProp = path.split(' as ')[1] || tProp
          path = path.split(' as ')[0]
        }

        let clones = []
        const hook = document.createComment(
          `${templateNode.localName} s:repeat="${attribute.value}"`
        )
        let templateHTML
        Slim._$(hook)
        Slim.selectRecursive(templateNode, true).forEach(
          e => (Slim._$(e).excluded = true)
        )
        templateNode.parentElement.insertBefore(hook, templateNode)
        templateNode.remove()
        Slim.unbind(source, templateNode)
        Slim.asap(() => {
          templateNode.setAttribute('s:iterate', '')
          templateNode.removeAttribute('s:repeat')
          templateHTML = templateNode.outerHTML
          templateNode.innerHTML = ''
        })
        let oldDataSource = []
        Slim.bind(source, hook, path, () => {
          const dataSource = Slim.lookup(source, path) || []
          let offset = 0
          let restOfData = []
          // get the diff
          const diff = Array(dataSource.length)
          dataSource.forEach((d, i) => {
            if (oldDataSource[i] !== d) {
              diff[i] = true
            }
          })
          oldDataSource = dataSource.concat()
          let indices = Object.keys(diff)
          if (dataSource.length < clones.length) {
            const disposables = clones.slice(dataSource.length)
            clones = clones.slice(0, dataSource.length)
            disposables.forEach(clone => clone.remove())
            // unbind disposables?
            indices.forEach(index => {
              const clone = clones[index]
              ;[clone].concat(Slim.qSelectAll(clone, '*')).forEach(t => {
                t[_$].repeater[tProp] = dataSource[index]
                Slim.commit(t, tProp)
              })
            })
          } else {
            // recycle
            clones.length &&
            indices.forEach(index => {
              const clone = clones[index]
              if (!clone) return
                ;[clone].concat(Slim.qSelectAll(clone, '*')).forEach(t => {
                t[_$].repeater[tProp] = dataSource[index]
                Slim.commit(t, tProp)
              })
            })
            restOfData = dataSource.slice(clones.length)
            offset = clones.length
          }
          if (!restOfData.length) return
          // new clones
          const range = document.createRange()
          range.setStartBefore(hook)
          let html = Array(restOfData.length)
            .fill(templateHTML)
            .join('')
          const frag = range.createContextualFragment(html)
          let all = []
          let i = 0
          while (i < frag.children.length) {
            const e = frag.children.item(i)
            clones.push(e)
            all.push(e)
            Slim._$(e).repeater[tProp] = dataSource[i + offset]
            const subTree = Slim.qSelectAll(e, '*')
            subTree.forEach(t => {
              all.push(t)
              Slim._$(t).repeater[tProp] = dataSource[i + offset]
              Slim.commit(t, tProp)
            })
            i++
          }
          source._bindChildren(all)
          all.forEach(t => {
            if (t.__isSlim) {
              t.createdCallback()
              Slim.asap(() => {
                Slim.commit(t, tProp)
                t[tProp] = t[_$].repeater[tProp]
              })
            } else {
              Slim.commit(t, tProp)
              t[tProp] = t[_$].repeater[tProp]
            }
          })
          hook.parentElement.insertBefore(frag, hook)
        })
        source[_$].reversed[tProp] = true
      },
      true
    )
  } else {
    Slim.customDirective(
      attr => /^s:repeat$/.test(attr.nodeName),
      (source, templateNode, attribute) => {
        wrappedRepeaterExecution(source, templateNode, attribute)

        // source._executeBindings()
      },
      true
    )
  }

  if (!__SLIM_ALREADY_DEFINED__) {
    class SlimRepeater extends Slim {
      get dataSource() {
        return this._dataSource
      }
      set dataSource(v) {
        if (this._dataSource !== v) {
          this._dataSource = v
          this.render()
        }
      }
      get boundParent() {
        return this[_$].boundParent
      }
      _bindChildren(tree) {
        tree = Array.prototype.slice.call(tree)
        const directChildren = Array.prototype.filter.call(
          tree,
          child => child.parentNode.localName === 'slim-root-fragment'
        )
        directChildren.forEach((child, index) => {
          child.setAttribute('s:iterate', `${this.dataPath} : ${index}`)
          Slim.selectRecursive(child).forEach(e => {
            Slim._$(e).repeater[this.dataProp] = this.dataSource[index]
            e[this.dataProp] = this.dataSource[index]
            if (e instanceof Slim) {
              e[this.dataProp] = this.dataSource[index]
            }
          })
        })
      }
      onRender() {
        if (!this.boundParent) return
        const tree = Slim.selectRecursive(this)
        this.boundParent && this.boundParent._bindChildren(tree)
        this.boundParent._executeBindings()
      }
      render(...args) {
        if (!this.boundParent) return
        Slim.qSelectAll(this, '*').forEach(e => {
          Slim.unbind(this.boundParent, e)
        })
        if (!this.dataSource || !this.templateNode || !this.boundParent) {
          return super.render('')
        }
        const newTemplate = Array(this.dataSource.length)
          .fill(this.templateNode.outerHTML)
          .join('')
        this.innerHTML = ''
        super.render(newTemplate)
      }
    }
    Slim.tag('slim-repeat', SlimRepeater)
  }

  if (window) {
    window['Slim'] = Slim
  }
  if (typeof module !== 'undefined') {
    module.exports.Slim = Slim
  }
})(window, document, HTMLElement)
