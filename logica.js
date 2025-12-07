// 1. INICIALIZAR MAPA
var map = L.map('miMapa').setView([-27.416, -59.033], 15);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
}).addTo(map);

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
    if(contador) contador.innerText = "Hay " + agenda.length + " clientes guardados.";
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
// 🧠 EL CEREBRO: OPTIMIZADOR REAL
// ======================================================
// Esta función ordena el Array 'clientes' para que la lista visual coincida con la ruta óptima
function optimizarOrdenClientes() {
    if (clientes.length < 3) return; // Si hay 2 puntos, no hay nada que ordenar

    var ordenados = [clientes[0]]; // El depósito siempre es el primero
    var pendientes = clientes.slice(1); // El resto
    var actual = clientes[0];

    while (pendientes.length > 0) {
        var masCerca = null;
        var distMin = Infinity;
        var idx = -1;

        // Buscamos quién está más cerca del ÚLTIMO visitado
        for (var i = 0; i < pendientes.length; i++) {
            var d = map.distance(actual.coords, pendientes[i].coords);
            if (d < distMin) {
                distMin = d;
                masCerca = pendientes[i];
                idx = i;
            }
        }
        
        // Lo agregamos a la nueva lista ordenada
        ordenados.push(masCerca);
        actual = masCerca; // Ahora nos paramos en este cliente
        pendientes.splice(idx, 1); // Lo tachamos de pendientes
    }

    // Reemplazamos la lista desordenada por la inteligente
    clientes = ordenados;
}

// ======================================================
// 🔍 BUSCADOR INTERNO
// ======================================================
window.buscarPersona = function() {
    var input = document.getElementById("inputBuscador");
    var filtro = input.value.toLowerCase();
    var lista = document.getElementById("listaResultados");
    lista.innerHTML = ""; lista.style.display = "block";

    if (agenda.length === 0) {
        lista.innerHTML = "<li style='padding:10px; color:#999;'>📭 Agenda vacía.</li>";
        return;
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
    // Verificar si ya está (opcional, por ahora lo dejamos agregar)
    clientes.push(persona);
    document.getElementById("inputBuscador").value = "";
    document.getElementById("listaResultados").style.display = "none";
    
    actualizarMapaYLista(); // Acá adentro se va a optimizar solo
    alert("✅ " + persona.nombre + " agregado y ruta re-calculada.");
}

// ======================================================
// 🗺️ VISUALIZACIÓN INTELIGENTE
// ======================================================
function actualizarMapaYLista() {
    // 1. PRIMERO OPTIMIZAMOS EL ORDEN 🧠
    optimizarOrdenClientes();
    guardarTodo(); // Guardamos el nuevo orden

    // 2. Limpiamos visuales
    marcadoresEnMapa.forEach(p => map.removeLayer(p));
    marcadoresEnMapa = [];
    var ul = document.getElementById("listaClientesHTML");
    ul.innerHTML = "";

    // 3. Dibujamos la lista (¡Ahora ya sale ordenada!)
    clientes.forEach((c, i) => {
        // --- MAPA ---
        var pin = L.marker(c.coords).addTo(map);
        var linkGoogle = `https://www.google.com/maps/dir/?api=1&destination=${c.coords[0]},${c.coords[1]}&travelmode=driving`;
        
        var contenidoPopup = i === 0 ? "<b>🏭 Depósito Central</b>" : `
            <b>${i}. ${c.nombre}</b><br>
            <hr style="margin:5px 0;">
            <a href="${linkGoogle}" target="_blank" style="display:block;background:#25D366;color:white;text-decoration:none;padding:5px;text-align:center;border-radius:4px;">🚗 Ir con Google</a>
            <button onclick="eliminarDeRuta(${i})" style="margin-top:5px;background:#ff4444;color:white;border:none;padding:5px;width:100%;border-radius:4px;">Quitar</button>
        `;
        pin.bindPopup(contenidoPopup);
        marcadoresEnMapa.push(pin);

        // --- LISTA ---
        var li = document.createElement("li");
        li.className = "item-cliente";
        
        var btnNav = i > 0 ? `<a href="${linkGoogle}" target="_blank" title="Navegar" style="text-decoration:none;font-size:18px;margin-right:10px;">🚗</a>` : '';
        
        // Le agregamos el NÚMERO DE ORDEN (i) para ver que funciona
        li.innerHTML = `
            <div style="display:flex; align-items:center;">
                <span style="margin-right:8px; font-weight:bold; color:#004AAD;">${i}.</span>
                <span>${c.nombre}</span>
            </div>
            <div style="display:flex; align-items:center;">
                ${btnNav}
                ${i>0 ? `<button class="btn-borrar" onclick="eliminarDeRuta(${i})">X</button>` : ''}
            </div>
        `;
        ul.appendChild(li);
    });

    dibujarRutaGPS();
}

// ======================================================
// 🚛 DIBUJAR RUTA (Ya recibe la lista ordenada)
// ======================================================
function dibujarRutaGPS() {
    if (clientes.length < 2) {
        limpiarCapasRuta();
        document.getElementById("textoDistancia").innerText = "0.00 km";
        return;
    }

    limpiarCapasRuta();
    document.getElementById("textoDistancia").innerText = "Calculando...";

    // Cerramos el circuito (Volver al depósito)
    var puntosGPS = clientes.map(c => L.latLng(c.coords[0], c.coords[1]));
    puntosGPS.push(L.latLng(clientes[0].coords[0], clientes[0].coords[1]));

    routingControl = L.Routing.control({
        waypoints: puntosGPS,
        routeWhileDragging: false, show: false, createMarker: function(){ return null; },
        lineOptions: { styles: [{color: '#004AAD', opacity: 0.8, weight: 6}] }
    }).addTo(map);

    routingControl.on('routesfound', function(e) {
        var kms = (e.routes[0].summary.totalDistance / 1000).toFixed(2);
        document.getElementById("textoDistancia").innerText = kms + " km 🛣️";
    });

    routingControl.on('routingerror', function() {
        console.warn("Fallo GPS, usando línea recta");
        limpiarCapasRuta();
        var lineaPts = puntosGPS;
        lineaRecta = L.polyline(lineaPts, {color:'red', dashArray:'10,10'}).addTo(map);
        
        var dTotal = 0; // Calculo manual rápido
        for(let i=0; i<puntosGPS.length-1; i++) dTotal += map.distance(puntosGPS[i], puntosGPS[i+1]);
        document.getElementById("textoDistancia").innerText = (dTotal/1000).toFixed(2) + " km 📏";
    });
}

function limpiarCapasRuta() {
    if(routingControl) { try{map.removeControl(routingControl)}catch(e){} routingControl=null; }
    if(lineaRecta) { map.removeLayer(lineaRecta); lineaRecta=null; }
}

// ======================================================
// EVENTOS Y EXTRAS
// ======================================================
map.on('click', function(e) {
    var input = document.getElementById("nombreCliente");
    var nombre = input.value;
    if (!nombre) { alert("⚠️ Escribí nombre primero."); input.focus(); return; }

    var nuevo = { nombre: nombre, coords: [e.latlng.lat, e.latlng.lng] };
    agenda.push(nuevo);
    clientes.push(nuevo); // Lo agregamos al final, pero...
    
    input.value = ""; 
    actualizarMapaYLista(); // ...¡Aquí se reordena solo!
});

window.eliminarDeRuta = function(i) {
    if (i===0) return alert("Depósito fijo.");
    clientes.splice(i, 1);
    actualizarMapaYLista();
}

window.borrarMemoria = function() {
    if(confirm("¿Borrar ruta?")) { localStorage.removeItem(rutaKey); location.reload(); }
}

window.activarGPS = function() {
    var btn = document.getElementById("btnGPS");
    var estado = document.getElementById("estadoGPS");
    if (watchID) {
        navigator.geolocation.clearWatch(watchID); watchID = null;
        btn.className = "btn-gps-inactivo"; btn.innerText = "▶ ACTIVAR SEGUIMIENTO"; estado.innerText = "GPS Apagado";
        if (miMarcador) map.removeLayer(miMarcador);
        return;
    }
    if (!navigator.geolocation) return alert("No GPS");
    btn.className = "btn-gps-activo"; btn.innerText = "⏹ DETENER"; estado.innerText = "Buscando...";
    var iconoYo = L.divIcon({ className: 'mi-icono-gps', html: '<div style="background-color:#2196F3;width:15px;height:15px;border-radius:50%;border:3px solid white;"></div>', iconSize: [20, 20] });
    watchID = navigator.geolocation.watchPosition(function(pos) {
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        estado.innerText = "📍 Activo (" + Math.round(pos.coords.accuracy) + "m)";
        if (miMarcador) miMarcador.setLatLng([lat, lng]); else miMarcador = L.marker([lat, lng], {icon: iconoYo}).addTo(map);
        // map.setView([lat, lng], 16); // Comentado para no molestar si mirás otra parte
    }, function(err) { estado.innerText = "Error GPS"; btn.className = "btn-gps-inactivo"; }, { enableHighAccuracy: true });
}

// INICIO
actualizarMapaYLista();
