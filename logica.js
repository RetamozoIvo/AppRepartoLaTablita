// 1. INICIALIZAR MAPA
var map = L.map('miMapa').setView([-27.416, -59.033], 15);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
}).addTo(map);

// ======================================================
// 🚀 NUEVO: MODO VIAJE (Pantalla Completa)
// ======================================================
var modoViajeActivo = false;

window.toggleModoViaje = function() {
    var body = document.body;
    
    if (!modoViajeActivo) {
        // --- ACTIVAR MODO VIAJE ---
        body.classList.add("modo-viaje");
        modoViajeActivo = true;
        
        // Ajustamos el mapa al nuevo tamaño (IMPORTANTE)
        setTimeout(function(){ map.invalidateSize(); }, 300);

        // Prendemos el GPS automáticamente
        if (!watchID) activarGPS();

        alert("🛣️ Iniciando recorrido. ¡Buen viaje!");

    } else {
        // --- SALIR MODO VIAJE ---
        body.classList.remove("modo-viaje");
        modoViajeActivo = false;
        
        // Ajustamos mapa de nuevo
        setTimeout(function(){ map.invalidateSize(); }, 300);
    }
}


// ======================================================
// 2. GESTIÓN DE DATOS
// ======================================================
var rutaKey = "rutaTablita_v3";
var agendaKey = "agendaTablita_v3";

var datosRuta = localStorage.getItem(rutaKey);
var clientes = datosRuta ? JSON.parse(datosRuta) : [{ nombre: "Depósito Central", coords: [-27.416, -59.033] }];

var datosAgenda = localStorage.getItem(agendaKey);
var agenda = datosAgenda ? JSON.parse(datosAgenda) : [];

function actualizarContador() {
    var contador = document.getElementById("contadorAgenda");
    if(contador) contador.innerText = "Agenda: " + agenda.length + " lugares guardados.";
}
actualizarContador();

function guardarTodo() {
    localStorage.setItem(rutaKey, JSON.stringify(clientes));
    localStorage.setItem(agendaKey, JSON.stringify(agenda));
    actualizarContador();
}

var routingControl = null;
var lineaRecta = null;
var marcadoresEnMapa = [];
var watchID = null;
var miMarcador = null;

// ======================================================
// 🧠 OPTIMIZADOR
// ======================================================
function optimizarOrdenClientes() {
    if (clientes.length < 3) return;
    var ordenados = [clientes[0]];
    var pendientes = clientes.slice(1);
    var actual = clientes[0];

    while (pendientes.length > 0) {
        var masCerca = null, distMin = Infinity, idx = -1;
        for (var i = 0; i < pendientes.length; i++) {
            var d = map.distance(actual.coords, pendientes[i].coords);
            if (d < distMin) { distMin = d; masCerca = pendientes[i]; idx = i; }
        }
        ordenados.push(masCerca);
        actual = masCerca;
        pendientes.splice(idx, 1);
    }
    clientes = ordenados;
}

// ======================================================
// 🔍 BUSCADOR
// ======================================================
window.buscarPersona = function() {
    var input = document.getElementById("inputBuscador");
    var filtro = input.value.toLowerCase();
    var lista = document.getElementById("listaResultados");
    lista.innerHTML = ""; lista.style.display = "block";

    if (agenda.length === 0) {
        lista.innerHTML = "<li style='padding:10px; color:#999;'>📭 Agenda vacía.</li>"; return;
    }
    var coincidencias = filtro === "" ? agenda : agenda.filter(p => p.nombre.toLowerCase().includes(filtro));

    if (coincidencias.length > 0) {
        coincidencias.forEach(p => {
            var li = document.createElement("li");
            li.innerHTML = `<span>👤 ${p.nombre}</span> <b style="color:#004AAD;">+</b>`;
            li.onclick = function() { agregarDesdeBuscador(p); };
            lista.appendChild(li);
        });
    } else {
        lista.innerHTML = "<li style='padding:10px; color:red;'>❌ No encontrado</li>";
    }
}

function agregarDesdeBuscador(persona) {
    clientes.push(persona);
    document.getElementById("inputBuscador").value = "";
    document.getElementById("listaResultados").style.display = "none";
    actualizarMapaYLista();
}

// ======================================================
// 🗺️ VISUALIZACIÓN
// ======================================================
function actualizarMapaYLista() {
    optimizarOrdenClientes(); // 🧠 Ordenamos siempre
    guardarTodo();

    marcadoresEnMapa.forEach(p => map.removeLayer(p));
    marcadoresEnMapa = [];
    var ul = document.getElementById("listaClientesHTML");
    ul.innerHTML = "";

    clientes.forEach((c, i) => {
        // MAPA
        var pin = L.marker(c.coords).addTo(map);
        var linkGoogle = `http://googleusercontent.com/maps.google.com/?q=${c.coords[0]},${c.coords[1]}&travelmode=driving`;
        
        var contenidoPopup = i === 0 ? "<b>🏭 Depósito</b>" : `
            <b>${i}. ${c.nombre}</b><br><hr style='margin:5px 0'>
            <a href="${linkGoogle}" target="_blank" style="display:block;background:#25D366;color:white;padding:5px;text-align:center;border-radius:4px;text-decoration:none;">🚗 Ir con Google</a>
            <button onclick="eliminarDeRuta(${i})" style="margin-top:5px;background:#ff4444;color:white;border:none;padding:5px;width:100%;border-radius:4px;">🗑️ Quitar</button>
        `;
        pin.bindPopup(contenidoPopup);
        marcadoresEnMapa.push(pin);

        // LISTA
        var li = document.createElement("li");
        li.className = "item-cliente";
        var btnNav = i > 0 ? `<a href="${linkGoogle}" target="_blank" style="text-decoration:none;font-size:18px;margin-right:10px;">🚗</a>` : '';
        li.innerHTML = `<div><strong style="color:#004AAD;margin-right:5px;">${i}.</strong> ${c.nombre}</div>
                        <div style="display:flex;align-items:center;">${btnNav} ${i>0 ? `<button class="btn-borrar" onclick="eliminarDeRuta(${i})">X</button>` : ''}</div>`;
        ul.appendChild(li);
    });
    dibujarRutaGPS();
}

// ======================================================
// 🚛 RUTA Y GPS
// ======================================================
function dibujarRutaGPS() {
    if (clientes.length < 2) { limpiarCapas(); document.getElementById("textoDistancia").innerText = "0.00 km"; return; }
    limpiarCapas();
    document.getElementById("textoDistancia").innerText = "Calculando...";
    
    var puntos = clientes.map(c => L.latLng(c.coords));
    puntos.push(L.latLng(clientes[0].coords)); // Vuelta

    routingControl = L.Routing.control({
        waypoints: puntos, routeWhileDragging: false, show: false, createMarker: function(){ return null; },
        lineOptions: { styles: [{color: '#004AAD', opacity: 0.8, weight: 6}] }
    }).addTo(map);

    routingControl.on('routesfound', function(e) {
        document.getElementById("textoDistancia").innerText = (e.routes[0].summary.totalDistance / 1000).toFixed(2) + " km 🛣️";
    });
    routingControl.on('routingerror', function() {
        limpiarCapas();
        var pts = puntos;
        lineaRecta = L.polyline(pts, {color:'red', dashArray:'10,10'}).addTo(map);
        var t=0; for(let i=0; i<pts.length-1; i++) t+=map.distance(pts[i], pts[i+1]);
        document.getElementById("textoDistancia").innerText = (t/1000).toFixed(2) + " km 📏";
    });
}

function limpiarCapas() {
    if(routingControl) { try{map.removeControl(routingControl)}catch(e){} routingControl=null; }
    if(lineaRecta) { map.removeLayer(lineaRecta); lineaRecta=null; }
}

map.on('click', function(e) {
    var input = document.getElementById("nombreCliente");
    var nombre = input.value;
    if (!nombre) { alert("⚠️ Escribí nombre arriba."); input.focus(); return; }
    var nuevo = { nombre: nombre, coords: [e.latlng.lat, e.latlng.lng] };
    agenda.push(nuevo); clientes.push(nuevo);
    input.value = ""; actualizarMapaYLista();
});

window.eliminarDeRuta = function(i) {
    if (i===0) return alert("Depósito fijo.");
    clientes.splice(i, 1); actualizarMapaYLista();
}

window.borrarMemoria = function() {
    if(confirm("¿Borrar ruta?")) { localStorage.removeItem(rutaKey); location.reload(); }
}

window.activarGPS = function() {
    var btn = document.getElementById("btnGPS");
    var estado = document.getElementById("estadoGPS");
    if (watchID) {
        navigator.geolocation.clearWatch(watchID); watchID = null;
        btn.innerText = "🛰️ Prender/Apagar GPS"; estado.innerText = "Inactivo";
        if (miMarcador) map.removeLayer(miMarcador); return;
    }
    if (!navigator.geolocation) return alert("No GPS");
    btn.innerText = "⏹ DETENER"; estado.innerText = "Buscando...";
    var iconoYo = L.divIcon({ className: 'mi-icono-gps', html: '<div style="background-color:#2196F3;width:15px;height:15px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px blue;"></div>', iconSize: [20, 20] });
    
    watchID = navigator.geolocation.watchPosition(function(pos) {
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        estado.innerText = "📍 Activo (" + Math.round(pos.coords.accuracy) + "m)";
        if (miMarcador) miMarcador.setLatLng([lat, lng]); else miMarcador = L.marker([lat, lng], {icon: iconoYo}).addTo(map);
        // map.setView([lat, lng], 17); // Descomentar si querés que te siga agresivamente
    }, function(err) { estado.innerText = "Error GPS"; }, { enableHighAccuracy: true });
}

actualizarMapaYLista();