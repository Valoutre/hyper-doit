const DOIT_GIF_SRC = require('./doit_gif_base64.js');
const DOIT_MP3_SRC = require('./doit_mp3_base64.js');

const throttle = require('lodash.throttle');
const Color = require('color');
const nameToHex = require('convert-css-color-name-to-hex');
const toHex = (str) => Color(nameToHex(str)).hexString();
const values = require('lodash.values');

const MAX_PARTICLES = 500;
const PARTICLE_NUM_RANGE = () => 5 + Math.round(Math.random() * 5);
const PARTICLE_GRAVITY = 0.075;
const PARTICLE_ALPHA_FADEOUT = 0.96;
const PARTICLE_VELOCITY_RANGE = {
  x: [-1, 1],
  y: [-3.5, -1.5]
};

exports.middleware = (store) => (next) => (action) => {
  if ('SESSION_ADD_DATA' === action.type) {
    const { data } = action;
    if (/(doit: command not found)|(command not found: doit)/.test(data)) {
      store.dispatch({
        type: 'DOIT_START'
      });
    } else {
      next(action);
    }
  } else {
    next(action);
  }
};

exports.reduceUI = (state, action) => {
  switch (action.type) {
    case 'DOIT_START':
      return state.set('doitMode', true);
    case 'DOIT_END':
      return state.set('doitMode', false);
  }
  return state;
};

exports.mapTermsState = (state, map) => {
  return Object.assign(map, {
    doitMode: state.ui.doitMode
  });
};

const passProps = (uid, parentProps, props) => {
  return Object.assign(props, {
    doitMode: parentProps.doitMode
  });
}

exports.getTermGroupProps = passProps;
exports.getTermProps = passProps;

// code based on
// https://atom.io/packages/power-mode
// https://github.com/itszero/rage-power/blob/master/index.jsx
exports.decorateTerm = (Term, { React, notify }) => {
  return class extends React.Component {
    constructor (props, context) {
      super(props, context);
      this._drawFrame = this._drawFrame.bind(this);
      this._resizeCanvas = this._resizeCanvas.bind(this);
      this._onTerminal = this._onTerminal.bind(this);
      this._onCursorChange = this._onCursorChange.bind(this);
      this._shake = throttle(this._shake.bind(this), 100, { trailing: false });
      this._spawnParticles = throttle(this._spawnParticles.bind(this), 25, { trailing: false });
      this._particles = [];
      this._div = null;
      this._cursor = null;
      this._observer = null;
      this._canvas = null;
      this._img = null;
      
    }

    _onTerminal (term) {
      if (this.props.onTerminal) this.props.onTerminal(term);
      this._div = term.div_;
      this._cursor = term.cursorNode_;
      this._window = term.document_.defaultView;
      this._observer = new MutationObserver(this._onCursorChange);
      this._observer.observe(this._cursor, {
        attributes: true,
        childList: false,
        characterData: false
      });
      this._initCanvas();
      this._initDoItImage();
      this._initDoItAudio();
      this._playDoIt();
    }

    _initDoItAudio () {
      this._audio = new Audio(DOIT_MP3_SRC);
      this._audio.onended = this._onAudioEnded.bind(this);
      this._audio.onplay = this._onAudioPlay.bind(this);
    }

    _playDoIt() {

      // start audio one time
      setTimeout(function() { 
        this._audio.play();
      }.bind(this), 2500);

      // print img
      this._div.appendChild(this._img);

      // hide img
      setTimeout(function() { 
        this._img.style.opacity = '0';
      }.bind(this), 3960);
      setTimeout(function() { 
        this._div.removeChild(this._img);
      }.bind(this), 4960);
    }

    _initDoItImage () {

      this._div.style.padding = '10px';

      this._img = document.createElement('img');
      this._img.src = DOIT_GIF_SRC;
      this._img.style.position = 'absolute';
      this._img.style.width = '268px';
      this._img.style.heigth = '200px';
      this._img.style.bottom = '0';
      this._img.style.right = '0';
      this._img.style.opacity = '1';
      this._img.style.transitionProperty = 'all';
      this._img.style.transitionDuration = '1s';
    }

    _onAudioPlay () {
      this._audioPlaying = setInterval(() => {
        this._shake();
      }, 100);
    }

    _resetAudio() {
      this._audio.pause();
      this._audio.currentTime = 0;
      clearInterval(this._audioPlaying);
    }

    _onAudioEnded () {
      this._resetAudio();
      this._resetShake();
    }

    _initCanvas () {
      this._canvas = document.createElement('canvas');
      this._canvas.style.position = 'absolute';
      this._canvas.style.top = '0';
      this._canvas.style.pointerEvents = 'none';
      this._canvasContext = this._canvas.getContext('2d');
      this._canvas.width = window.innerWidth;
      this._canvas.height = window.innerHeight;
      document.body.appendChild(this._canvas);
      this._window.requestAnimationFrame(this._drawFrame);
      this._window.addEventListener('resize', this._resizeCanvas);
    }

    _resizeCanvas () {
      this._canvas.width = window.innerWidth;
      this._canvas.height = window.innerHeight;
    }

    _drawFrame () {
      this._canvasContext.clearRect(0, 0, this._canvas.width, this._canvas.height);
      this._particles.forEach((particle) => {
        particle.velocity.y += PARTICLE_GRAVITY;
        particle.x += particle.velocity.x;
        particle.y += particle.velocity.y;
        particle.alpha *= PARTICLE_ALPHA_FADEOUT;
        this._canvasContext.fillStyle = `rgba(${particle.color.join(',')}, ${particle.alpha})`;
        this._canvasContext.fillRect(Math.round(particle.x - 1), Math.round(particle.y - 1), 3, 3);
      });
      this._particles = this._particles
        .slice(Math.max(this._particles.length - MAX_PARTICLES, 0))
        .filter((particle) => particle.alpha > 0.1);
      this._window.requestAnimationFrame(this._drawFrame);
    }

    _spawnParticles (x, y) {
      // const { colors } = this.props;
      const colors = this.props.doitMode
        ? values(this.props.colors).map(toHex)
        : [toHex(this.props.cursorColor)];
      const numParticles = PARTICLE_NUM_RANGE();
      for (let i = 0; i < numParticles; i++) {
        const colorCode = colors[i % colors.length];
        const r = parseInt(colorCode.slice(1, 3), 16);
        const g = parseInt(colorCode.slice(3, 5), 16);
        const b = parseInt(colorCode.slice(5, 7), 16);
        const color = [r, g, b];
        this._particles.push(this._createParticle(x, y, color));
      }
    }

    _createParticle (x, y, color) {
      return {
        x,
        y: y,
        alpha: 1,
        color,
        velocity: {
          x: PARTICLE_VELOCITY_RANGE.x[0] + Math.random() *
            (PARTICLE_VELOCITY_RANGE.x[1] - PARTICLE_VELOCITY_RANGE.x[0]),
          y: PARTICLE_VELOCITY_RANGE.y[0] + Math.random() *
            (PARTICLE_VELOCITY_RANGE.y[1] - PARTICLE_VELOCITY_RANGE.y[0])
        }
      };
    }

    _shake (power = 1) {
      if(!this.props.doitMode) return;

      const intensity = power + 2 * Math.random();
      const x = intensity * (Math.random() > 0.5 ? -1 : 1);
      const y = intensity * (Math.random() > 0.5 ? -1 : 1);
      this._div.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      setTimeout(() => {
        if (this._div) this._div.style.transform = '';
      }, 75);
    }

    _onCursorChange () {
      this._shake();
      const { top, left } = this._cursor.getBoundingClientRect();
      const origin = this._div.getBoundingClientRect();
      requestAnimationFrame(() => {
        this._spawnParticles(left + origin.left + 10, top + origin.top + 10);
      });
    }

    componentWillReceiveProps (next) {
      if (next.doitMode && !this.props.doitMode) {
        notify('DO IT !');
      } else if (!next.doitMode && this.props.doitMode) {
        notify('NO !!!!');
      }
    }

    render () {
      return React.createElement(Term, Object.assign({}, this.props, {
        onTerminal: this._onTerminal
      }));
    }

    componentWillUnmount () {
      document.body.removeChild(this._canvas);
      if (this._observer) {
        this._observer.disconnect();
      }
      this._resetAudio();
    }
  }
};
