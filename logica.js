// 1. INICIALIZAR MAPA
var map = L.map('miMapa').setView([-27.416, -59.033], 15);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
}).addTo(map);

// ======================================================
// 2. GESTIÓN DE DATOS (IMPORTANTE: Nombres de claves únicos)
// ======================================================
var rutaKey = "rutaTablita_v2";
var agendaKey = "agendaTablita_v2";

// Cargar Ruta del día
var datosRuta = localStorage.getItem(rutaKey);
var clientes = datosRuta ? JSON.parse(datosRuta) : [{ nombre: "Depósito Central", coords: [-27.416, -59.033] }];

// Cargar Agenda Histórica
var datosAgenda = localStorage.getItem(agendaKey);
var agenda = datosAgenda ? JSON.parse(datosAgenda) : [];

// Actualizar el contador visual
function actualizarContador() {
    var contador = document.getElementById("contadorAgenda");
    if(contador) contador.innerText = "Hay " + agenda.length + " clientes guardados.";
}
actualizarContador();

function guardarTodo() {
    localStorage.setItem(rutaKey, JSON.stringify(clientes));
    localStorage.setItem(agendaKey, JSON.stringify(agenda));
    actualizarContador();
}

// Variables globales
var routingControl = null;
var lineaRecta = null;
var marcadoresEnMapa = [];
var watchID = null;
var miMarcador = null;

// ======================================================
// 3. BUSCADOR INTERNO (Lógica corregida)
// ======================================================
window.buscarPersona = function() {
    var input = document.getElementById("inputBuscador");
    var filtro = input.value.toLowerCase();
    var lista = document.getElementById("listaResultados");
    
    lista.innerHTML = ""; // Limpiar
    lista.style.display = "block"; // Mostrar siempre al intentar buscar

    if (agenda.length === 0) {
        lista.innerHTML = "<li style='padding:10px; color:#999;'>📭 La agenda está vacía.<br>¡Cargá un cliente en el mapa primero!</li>";
        return;
    }

    // Filtrar
    var coincidencias;
    if (filtro === "") {
        coincidencias = agenda; // Mostrar todos si no escribe nada
    } else {
        coincidencias = agenda.filter(p => p.nombre.toLowerCase().includes(filtro));
    }

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
    // Verificar si ya está en la ruta para no duplicar (Opcional)
    // clientes.push(persona); 
    
    // Agregamos directo
    clientes.push(persona);
    
    // Limpiamos buscador
    document.getElementById("inputBuscador").value = "";
    document.getElementById("listaResultados").style.display = "none";
    
    guardarTodo();
    actualizarMapaYLista();
    alert("✅ " + persona.nombre + " agregado a la ruta de hoy.");
}

// ======================================================
// 4. MAPA Y CLICS (Guardar Cliente)
// ======================================================
map.on('click', function(e) {
    var input = document.getElementById("nombreCliente");
    var nombre = input.value;

    if (!nombre) {
        alert("⚠️ ¡Escribí un nombre primero en la caja de arriba!");
        input.focus();
        return;
    }

    var nuevoLugar = { nombre: nombre, coords: [e.latlng.lat, e.latlng.lng] };

    // 1. Guardar en Agenda (Para siempre)
    agenda.push(nuevoLugar);
    
    // 2. Guardar en Ruta (Para hoy)
    clientes.push(nuevoLugar);
    
    input.value = ""; 
    guardarTodo();
    actualizarMapaYLista();

    // Confirmación visual
    alert("💾 ¡Guardado! '" + nombre + "' ya está en tu Agenda y en la Ruta.");
});

// ======================================================
// 5. ACTUALIZAR VISTA
// ======================================================
function actualizarMapaYLista() {
    marcadoresEnMapa.forEach(p => map.removeLayer(p));
    marcadoresEnMapa = [];
    var ul = document.getElementById("listaClientesHTML");
    ul.innerHTML = "";

    clientes.forEach((c, i) => {
        // Mapa
        var pin = L.marker(c.coords).addTo(map);
        pin.bindPopup(i===0 ? "<b>🏭 Depósito</b>" : `<b>${c.nombre}</b><br><button onclick="eliminarDeRuta(${i})" style="color:red">Quitar</button>`);
        marcadoresEnMapa.push(pin);

        // Lista
        var li = document.createElement("li");
        li.className = "item-cliente";
        li.innerHTML = `<span>${i===0?"🏭":"📍"} ${c.nombre}</span> ${i>0 ? `<button class="btn-borrar" onclick="eliminarDeRuta(${i})">X</button>` : ''}`;
        ul.appendChild(li);
    });
    recalcularRuta();
}

window.eliminarDeRuta = function(i) {
    if (i===0) return alert("El depósito es fijo.");
    clientes.splice(i, 1);
    guardarTodo();
    actualizarMapaYLista();
}

window.borrarMemoria = function() {
    if(confirm("¿Borrar SOLO la ruta de hoy?\n(Tus clientes de la agenda NO se borran)")) {
        localStorage.removeItem(rutaKey);
        location.reload();
    }
}

// ======================================================
// 6. CÁLCULO DE RUTA (Tu código de siempre)
// ======================================================
function recalcularRuta() {
    if (clientes.length < 2) {
        if(routingControl) { try{map.removeControl(routingControl)}catch(e){} routingControl=null; }
        if(lineaRecta) { map.removeLayer(lineaRecta); lineaRecta=null; }
        document.getElementById("textoDistancia").innerText = "0.00 km";
        return;
    }
    // Algoritmo Vecino
    let visitados = [clientes[0]];
    let pendientes = clientes.slice(1);
    let actual = clientes[0];
    while(pendientes.length > 0) {
        let cerca = null, distMin = Infinity, idx = -1;
        for(let i=0; i<pendientes.length; i++) {
            let d = map.distance(actual.coords, pendientes[i].coords);
            if(d < distMin) { distMin = d; cerca = pendientes[i]; idx = i; }
        }
        if(cerca) { visitados.push(cerca); actual = cerca; pendientes.splice(idx, 1); } else break;
    }
    visitados.push(clientes[0]);

    if(routingControl) { try{map.removeControl(routingControl)}catch(e){} routingControl=null; }
    if(lineaRecta) { map.removeLayer(lineaRecta); lineaRecta=null; }
    document.getElementById("textoDistancia").innerText = "Calculando...";

    var puntos = visitados.map(c => L.latLng(c.coords[0], c.coords[1]));
    routingControl = L.Routing.control({
        waypoints: puntos, routeWhileDragging: false, show: false, createMarker: function(){ return null; },
        lineOptions: { styles: [{color: '#004AAD', opacity: 0.8, weight: 6}] }
    }).addTo(map);

    routingControl.on('routesfound', function(e) {
        document.getElementById("textoDistancia").innerText = (e.routes[0].summary.totalDistance / 1000).toFixed(2) + " km 🛣️";
    });
    routingControl.on('routingerror', function() {
        if(routingControl) { try{map.removeControl(routingControl)}catch(e){} routingControl=null; }
        var pts = visitados.map(c => c.coords);
        lineaRecta = L.polyline(pts, {color:'red', dashArray:'10,10'}).addTo(map);
        var t=0; for(let i=0; i<visitados.length-1; i++) t += map.distance(visitados[i].coords, visitados[i+1].coords);
        document.getElementById("textoDistancia").innerText = (t/1000).toFixed(2) + " km 📏";
    });
}

// 7. GPS (Tu código de siempre)
window.activarGPS = function() {
    var btn = document.getElementById("btnGPS");
    var estado = document.getElementById("estadoGPS");
    if (watchID) {
        navigator.geolocation.clearWatch(watchID); watchID = null;
        btn.className = "btn-gps-inactivo"; btn.innerText = "▶ ACTIVAR SEGUIMIENTO"; estado.innerText = "GPS Apagado";
        if (miMarcador) map.removeLayer(miMarcador);
        return;
    }
    if (!navigator.geolocation) return alert("No tenés GPS");
    btn.className = "btn-gps-activo"; btn.innerText = "⏹ DETENER"; estado.innerText = "Buscando...";
    var iconoYo = L.divIcon({ className: 'mi-icono-gps', html: '<div style="background-color:#2196F3;width:15px;height:15px;border-radius:50%;border:3px solid white;"></div>', iconSize: [20, 20] });
    watchID = navigator.geolocation.watchPosition(function(pos) {
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        estado.innerText = "📍 Activo (Precisión: " + Math.round(pos.coords.accuracy) + "m)";
        if (miMarcador) miMarcador.setLatLng([lat, lng]); else miMarcador = L.marker([lat, lng], {icon: iconoYo}).addTo(map);
        map.setView([lat, lng], 16);
    }, function(err) { console.error(err); estado.innerText = "Error GPS"; btn.className = "btn-gps-inactivo"; }, { enableHighAccuracy: true });
}

actualizarMapaYLista();