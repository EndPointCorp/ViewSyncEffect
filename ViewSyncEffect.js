 /**
 * @author alteredq / http://alteredqualia.com/
 * @author mrdoob / http://mrdoob.com/
 * @author arodic / http://aleksandarrodic.com/
 * @author alfski / http://uws.edu.au/eresearch/
 */

// Globals - bad?

var cameraViewSync = new THREE.PerspectiveCamera();

THREE.ViewSyncEffect = function ( renderer ) {

    // Thanks to stackoverflow, user Briguy37
    function generateUUID() {
        var d = performance.now();
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (d + Math.random()*16)%16 | 0;
            d = Math.floor(d/16);
            return (c=='x' ? r : (r&0x3|0x8)).toString(16);
        });
        return uuid;
    }

	// internals

	var _websocket = new WebSocket( "ws://" + window.location.host + "/websocket" ); // arg?

	var _extraInfo = [];
	var _extraCallback;         // callback used to process extraInfo data
    var _navigationCallback;    // callback for navigation packets

	var _position = new THREE.Vector3();
	var _quaternion = new THREE.Quaternion();
	var _scale = new THREE.Vector3(); // needed but not used

	var _yawAxis = new THREE.Vector3( 0,1,0 ); // yaw - rotate around Y
	var _rollAxis = new THREE.Vector3( 0,0,1 ); // roll - rotate around Z ?check?
	var _pitchAxis = new THREE.Vector3( 1,0,0 ); // pitch - rotate around X ?check?

	var _yawRads = 0.0; // yaw rotation offset in radians
	var _pitchRads = 0.0; // not used yet
	var _rollRads = 0.0; // not used yet

	// initialization
	var _wsConnected = false;
    var _config = {
        slave: false,
        yaw: 0.0,
        pitch: 0.0,
        roll: 0.0,
        fov: 0.0
    }
	var _lastMesg = "";

    var _src_id = generateUUID();

    this.configureFromURL = function() {
        // parse URL parameters
        var _qryArgs = _getQueryStringVars();

        if ( _qryArgs[ "slave" ] ) { _config.slave = true; }
        if ( _qryArgs[ "yaw" ] ) {
            _config.yaw = _qryArgs[ "yaw" ];
            console.log( "_config.yaw:"+_config.yaw );
        }
        if ( _qryArgs[ "pitch" ] ) { } // eventually also do pitch/roll
        if ( _qryArgs[ "roll" ] ) { }

        if ( _qryArgs[ "fov" ] ) {
            _config.fov = _qryArgs[ "fov" ];
            console.log( "_config.fov:"+_config.fov );
        }
    }

    this.configure = function(config) {
        var fields = ['pitch', 'roll', 'yaw', 'slave'];

        for (var att in config) {
            _config[att] = config[att]
        }
    }

	// set up websocket callbacks
    _websocket.onmessage = function ( evt ) {
        //console.log("evt:"+evt.data);
        var camData = JSON.parse( evt.data );

        // Ignore messages we sent, that are reflected back at us
        if (camData.data.hasOwnProperty('src') && camData.data.src === _src_id) {
            return;
        }

        if ( _config.slave ) { // only slaves need to change their position based on incoming websocket data
            if (typeof camData.data.p !== 'undefined' ) {
                _position = camData.data.p;
            }
            if (typeof camData.data.q !== 'undefined' ) {
                _quaternion = camData.data.q;
            }
		}
        else if (camData.type === 'navigation' && typeof(_navigationCallback) !== 'undefined') { // only masters need to pay attention to the spacenav
            _navigationCallback(camData);
            return;
        }

        // Everyone, including masters, wants to see extraData stuff
        if ( typeof(camData.data.extra) !== 'undefined' && typeof(_extraCallback) !== undefined ) {
            _extraCallback( camData.data.extra );
        }
	}
	_websocket.onopen = function () {
		_wsConnected = true;
		// if ( _config.slave ) { _websocket.send( "resend" ); }
	}
	_websocket.onclose = function () { _wsConnected = false; }

	renderer.autoClear = false;

    // Sets a callback function to handle extraInfo data on the slave
    this.setExtraCallback = function (a) {
        _extraCallback = a;
    }

    // Sets a callback function to handle navigation data on the master
    this.setNavigationCallback = function (a) {
        _navigationCallback = a;
    }

	this.setSize = function ( width, height ) {

		renderer.setSize( width, height );

        _yawRads   = THREE.Math.degToRad( _config.yaw   * width / height );
        _rollRads  = THREE.Math.degToRad( _config.roll  * width / height );
        _pitchRads = THREE.Math.degToRad( _config.pitch * width / height );
	};

	this.setClearColor = function ( color ) {

		renderer.setClearColor( color, 1 );
	};

    this.extraInfo = function ( object ) {
        _extraInfo = object;
    }

	this.isSlave = function () {
		return _config.slave;
	};

	this.render = function ( scene, camera ) {

		scene.updateMatrixWorld();

		if ( camera.parent === undefined ) camera.updateMatrixWorld();
	
		if ( !_config.slave ) { // get & send camera position & quaternion via websocket

			camera.matrixWorld.decompose( _position, _quaternion, _scale );
			var pov = { 'type' : 'pano_viewsync', 'data' : { 'src' : _src_id, p:_position, q:_quaternion, extra: _extraInfo }};
            var povMesg = JSON.stringify( pov );
			//console.log("pov:"+povMesg);

			if ( povMesg != _lastMesg && _wsConnected ) { // only if new data and connected
                _websocket.send(povMesg);
                _extraInfo = undefined;
				_lastMesg = povMesg;
			}
		}

		if ( _config.fov != 0) { camera.fov = _config.fov; } // if set, always overwrite fov

		camera.updateProjectionMatrix();

		cameraViewSync.projectionMatrix = camera.projectionMatrix;
		cameraViewSync.position.copy( _position ); // for slave can we do these in ws.onmessage?

        // Is this a bug in Three.js Quaternions, or something, that I have to do this?
        _quaternion.x = _quaternion._x;
        _quaternion.y = _quaternion._y;
        _quaternion.z = _quaternion._z;
        _quaternion.w = _quaternion._w;

		cameraViewSync.quaternion.copy( _quaternion );

		cameraViewSync.updateMatrixWorld();

		if (_yawRads != 0 ) {
			cameraViewSync.rotateOnAxis( _yawAxis, _yawRads );
		}
		if (_rollRads != 0 ) {
			cameraViewSync.rotateOnAxis( _rollAxis, _rollRads );
		}
		if (_pitchRads != 0 ) {
			cameraViewSync.rotateOnAxis( _pitchAxis, _pitchRads );
		}

		//renderer.clear(); // not needed?

		renderer.render( scene, cameraViewSync );
	};
};

function _getQueryStringVars() {

    var server_variables = {};
    var query_string = window.location.search.split( "?" )[1];
    if ( !query_string ) return false;
    var get = query_string.split( "&" );

    for ( var i = 0; i < get.length; i++ ) {
        var pair = get[ i ].split( "=" );
        server_variables[ pair[0] ] = unescape( pair[1] );
    }

    return server_variables;
}
