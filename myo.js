(function(){

	var Socket;
	if(typeof window === 'undefined'){
		Socket = require('ws');
	}else {
		if(!("WebSocket" in window)) console.error('Myo.js : Sockets not supported :(');
		Socket = WebSocket;
	}


	/**
		Myo Root Object
	**/

	Myo = {
		defaults : {
			api_version : 3,
			socket_url  : "ws://127.0.0.1:10138/myo/",
		},

		events : [],
		myos : [],


		onError : function(){
			throw 'Myo.js had an error with the socket. Myo Connect might not be running. If it is, double check the API version.';
		},

		/**
		 * Event functions
		 */
		trigger : function(eventName){
			var args = Array.prototype.slice.apply(arguments).slice(1);
			trigger.call(Myo, Myo.events, eventName, args);
			return Myo;
		},
		on : function(eventName, fn){
			return on(Myo.events, eventName, fn);
		},

		/*
		initSocket : function(){
			Myo.socket = new Socket(Myo.defaults.socket_url + Myo.defaults.api_version);
			Myo.socket.onmessage = handleMessage;
			Myo.socket.onerror = Myo.onError;
		},
		*/

		connect : function(){
			Myo.socket = new Socket(Myo.defaults.socket_url + Myo.defaults.api_version);
			Myo.socket.onmessage = handleMessage;
			Myo.socket.onerror = Myo.onError;
		},
		disconnect : function(){
			Myo.socket.close();
		},
	};


	myoList = {};


	var createMyo = function(pairedDataMsg){

		console.log('creating myo', pairedDataMsg.name);

		var newMyo = Object.create(myoInstance, {test : {value : 6}});
		//newMyo.options = extend(Myo.options, {});
		newMyo.events = [];
		newMyo.mac_address = pairedDataMsg.mac_address;
		newMyo.name = pairedDataMsg.name;
		Myo.myos.push(newMyo);
		myoList[pairedDataMsg.myo] = newMyo;
	}



	/**
		Myo Instance Object
	**/




	var myoInstance = {



		create : function(pairedDataMsg){

			console.log('creating myo', pairedDataMsg.name);

			var newMyo = merge_options(Object.create(myoInstance), {

				mac_address : pairedDataMsg.mac_address,
				name : pairedDataMsg.name,

				myoConnectINdex : pairedDataMsg.myo,

				isLocked : false,
				isConnected : false,
				batteryLevel : 0,
				orientationOffset : {x : 0,y : 0,z : 0,w : 1},
				lastIMU : undefined,
				arm : undefined,
				direction : undefined,
				events : [],


			});

			//console.log(newMyo);
			//newMyo.options = extend(Myo.options, {});
			//newMyo.events = [];
			//newMyo.mac_address = pairedDataMsg.mac_address;
			//newMyo.name = pairedDataMsg.name;
			delete newMyo.create;

			Myo.myos.push(newMyo);
			myoList[pairedDataMsg.myo] = newMyo;
		},

		trigger : function(eventName){
			var args = Array.prototype.slice.apply(arguments).slice(1);
			trigger.call(this, Myo.events, eventName, args);
			trigger.call(this, this.events, eventName, args);
			return this;
		},
		on : function(eventName, fn){
			return on(this.events, eventName, fn);
		},
		off : function(eventName){
			this.events = off(this.events, eventName);
		},

/*
		timer : function(status, timeout, fn){
			if(status){
				this.timeout = setTimeout(fn.bind(this), timeout);
			}else{
				clearTimeout(this.timeout);
			}
		},
*/
		lock : function(){
			if(this.isLocked) return this;

			Myo.socket.send(JSON.stringify(["command", {
				"command": "lock",
				"myo": this.id
			}]));

			this.isLocked = true;
			this.trigger('lock');
			return this;
		},
		unlock : function(timeout){
			var self = this;
			clearTimeout(this.lockTimeout);
			if(timeout){
				Myo.socket.send(JSON.stringify(["command", {
					"command": "unlock",
					"myo": this.id,
					"type": "hold"
				}]));

				this.lockTimeout = setTimeout(function(){
					self.lock();
				}, timeout);
			} else {
				Myo.socket.send(JSON.stringify(["command", {
					"command": "unlock",
					"myo": this.id,
					"type": "timed"
				}]));
			}
			if(!this.isLocked) return this;
			this.isLocked = false;
			this.trigger('unlock');
			return this;
		},
		zeroOrientation : function(){
			this.orientationOffset = quatInverse(this._lastQuant);
			this.trigger('zero_orientation');
			return this;
		},
		setLockingPolicy: function (policy) {
			policy = policy || "standard";
			Myo.socket.send(JSON.stringify(['command',{
				"command": "set_locking_policy",
				"type": policy
			}]));
			return this;
		},
		vibrate : function(intensity){
			intensity = intensity || 'medium';
			Myo.socket.send(JSON.stringify(['command',{
				"command": "vibrate",
				"myo": this.id,
				"type": intensity
			}]));
			return this;
		},
		requestBluetoothStrength : function(){
			Myo.socket.send(JSON.stringify(['command',{
				"command": "request_rssi",
				"myo": this.id
			}]));
			return this;
		},
		streamEMG : function(enabled){
			var type = 'enabled';
			if(enabled === false) type = 'disabled';
			Myo.socket.send(JSON.stringify(['command',{
				"command": "set_stream_emg",
				"myo": this.id,
				"type" : type
			}]));
			return this;
		}
	};






	function merge_options(obj1,obj2){
	    var obj3 = {};
	    for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
	    for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }
	    return obj3;
	}





	/**
	 * Utils
	 */
	var extend = function(){
		var result = {};
		for(var i in arguments){
			var obj = arguments[i];
			for(var propName in obj){
				if(obj.hasOwnProperty(propName)){ result[propName] = obj[propName]; }
			}
		}
		return result;
	};
	var unique_counter = 0;
	var getUniqueId = function(){
		unique_counter++;
		return new Date().getTime() + "" + unique_counter;
	};

	var quatInverse = function(q) {
		var len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
		return {
			w: q.w/len,
			x: -q.x/len,
			y: -q.y/len,
			z: -q.z/len
		};
	};
	var quatRotate = function(q, r) {
		return {
			w: q.w * r.w - q.x * r.x - q.y * r.y - q.z * r.z,
			x: q.w * r.x + q.x * r.w + q.y * r.z - q.z * r.y,
			y: q.w * r.y - q.x * r.z + q.y * r.w + q.z * r.x,
			z: q.w * r.z + q.x * r.y - q.y * r.x + q.z * r.w
		};
	};


	var eventTable = {
		'pose' : function(myo, data){
			myo.trigger(myo.lastPose, false, data.timestamp);
			myo.trigger('pose', myo.lastPose, false, data.timestamp);
			myo.trigger(data.pose, true, data.timestamp);
			myo.trigger('pose', data.pose, true, data.timestamp);
			myo.lastPose = data.pose;
		},
		'rssi' : function(myo, data){
			myo.trigger('bluetooth_strength', data.rssi, data.timestamp);
		},
		'orientation' : function(myo, data){
			myo._lastQuant = data.orientation;
			ori = quatRotate(myo.orientationOffset, data.orientation);
			var imu_data = {
				orientation : ori,
				accelerometer : {
					x : data.accelerometer[0],
					y : data.accelerometer[1],
					z : data.accelerometer[2]
				},
				gyroscope : {
					x : data.gyroscope[0],
					y : data.gyroscope[1],
					z : data.gyroscope[2]
				}
			};
			if(!myo.lastIMU) myo.lastIMU = imu_data;
			myo.trigger('orientation',   imu_data.orientation, data.timestamp);
			myo.trigger('accelerometer', imu_data.accelerometer, data.timestamp);
			myo.trigger('gyroscope',     imu_data.gyroscope, data.timestamp);
			myo.trigger('imu',           imu_data, data.timestamp);
			myo.lastIMU = imu_data;
		},
		'emg' : function(myo, data){
			myo.trigger(data.type, data.emg, data.timestamp);
		},
		'arm_synced' : function(myo, data){
			console.log('synced', data);
			myo.arm = data.arm;
			myo.direction = data.x_direction;
			myo.trigger(data.type, data, data.timestamp);
			myo.trigger('status', data, data.timestamp);
		},
		'arm_unsynced' : function(myo, data){
			myo.arm = undefined;
			myo.direction = undefined;
			myo.trigger(data.type, data, data.timestamp);
			myo.trigger('status', data, data.timestamp);
		},
		'connected' : function(myo, data){
			myo.connect_version = data.version.join('.');
			myo.isConnected = true;
			for(var attr in data){
				myo[attr] = data[attr];
			}
			myo.trigger(data.type, data, data.timestamp);
			myo.trigger('status', data, data.timestamp);
		},
		'disconnected' : function(myo, data){
			myo.isConnected = false;
			myo.trigger(data.type, data, data.timestamp);
			myo.trigger('status', data, data.timestamp);
		}

	};

	var handleMessage = function(msg){
		var data = JSON.parse(msg.data)[1];


		if(data.type == 'paired' && !Myo.myos[data.myo] ) myoInstance.create(data);

	//	if(data.type == 'pose') console.log(data);



		if(eventTable[data.type]){
			eventTable[data.type](myoList[data.myo], data);
		}else{
			myoList[data.myo].trigger('status', data, data.timestamp);
		}
	};


	/**
	 * Eventy-ness
	 */
	var trigger = function(events, eventName, args){
		var self = this;
		//
		events.map(function(event){
			if(event.name == eventName) event.fn.apply(self, args);
			if(event.name == '*'){
				var args_temp = args.slice(0);
				args_temp.unshift(eventName);
				event.fn.apply(self, args_temp);
			}
		});
		return this;
	};
	var on = function(events, name, fn){
		var id = getUniqueId();
		events.push({
			id   : id,
			name : name,
			fn   : fn
		});
		return id;
	};
	var off = function(events, name){
		events = events.reduce(function(result, event){
			if(event.name == name || event.id == name) {
				return result;
			}
			result.push(event);
			return result;
		}, []);
		return events;
	};









	if(typeof module !== 'undefined') module.exports = Myo;
})();




