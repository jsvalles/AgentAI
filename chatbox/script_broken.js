const messagesEl = document.getElementById('messages');
const inputForm = document.getElementById('inputForm');
const messageInput = document.getElementById('messageInput');
const optionsContainer = document.getElementById('optionsContainer');

let reportState = { step: null, sistema: null, modulo: null };
let lastJiraTicket = null; // Guardar el código del último ticket creado
let currentOptions = []; // Opciones actuales disponibles
let stateHistory = []; // Historial para volver atrás

function appendMessage(kind, text){
  const el = document.createElement('div');
  el.className = 'message ' + (kind === 'user' ? 'user' : 'bot');
  el.innerHTML = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showOptions(options, onSelect, allowBack = true){
  currentOptions = options; // Guardar opciones actuales
  optionsContainer.innerHTML = '';
  optionsContainer.style.display = 'flex';
  
  options.forEach(opt=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.addEventListener('click', ()=>{
      currentOptions = []; // Limpiar opciones al seleccionar
      onSelect(opt.value);
    });
    optionsContainer.appendChild(btn);
  });
  
  // Agregar botón de volver si hay historial y está permitido
  if(allowBack && stateHistory.length > 0){
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.textContent = '⬅️ Volver';
    backBtn.style.cssText = 'background:#6b7280;';
    backBtn.addEventListener('click', ()=>goBack());
    optionsContainer.appendChild(backBtn);
  }
}

function hideOptions(){
  currentOptions = []; // Limpiar opciones actuales
  optionsContainer.innerHTML = '';
  optionsContainer.style.display = 'none';
}

function searchInFAQs(query, sistema){
  appendMessage('bot', `🔍 Buscando en Preguntas Frecuentes${sistema ? ' de ' + sistema : ''}...`);
  
  const params = new URLSearchParams();
  if(query) params.append('q', query);
  if(sistema) params.append('sistema', sistema);
  
  fetch('/api/confluence/faq-search?' + params.toString())
    .then(r => r.json())
    .then(data => {
      if(data.error){
        appendMessage('bot', 'No pude conectar con la base de preguntas frecuentes. ¿Deseas explorar la base de conocimiento general?');
        showOptions([
          { label: 'Sí, ver KB', value: 'yes' },
          { label: 'No, gracias', value: 'no' }
        ], (choice)=>{
          if(choice === 'yes'){
            appendMessage('user', 'Sí, ver KB');
            hideOptions();
            appendMessage('bot', 'Puedes consultar toda nuestra base de conocimiento en Confluence:');
            appendMessage('bot', '🔗 <a href="https://redclay.atlassian.net/wiki/spaces/KMCELSIA/overview" target="_blank" style="color: #2563eb; text-decoration: underline;">Acceder a la Base de Conocimiento</a>');
            appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte?');
          }else{
            appendMessage('user', 'No, gracias');
            hideOptions();
          }
        });
        return;
      }
      
      const results = data.results || [];
      
      if(results.length === 0){
        // Guardar automáticamente la pregunta sin respuesta
        fetch('/api/confluence/save-pending-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: query, sistema: sistema })
        })
        .then(r => r.json())
        .then(data => {
          if(data.success){
            console.log('✅ Pregunta guardada automáticamente para revisión');
          }
        })
        .catch(err => {
          console.error('Error guardando pregunta:', err);
        });
        
        appendMessage('bot', 'No encontré esta pregunta en nuestras FAQs. He registrado tu consulta para que nuestro equipo la agregue pronto. 📝');
        appendMessage('bot', 'Mientras tanto, ¿qué te gustaría hacer?');
        showOptions([
          { label: '🔍 Ver base de conocimiento', value: 'kb' },
          { label: '📋 Crear ticket de soporte', value: 'ticket' },
          { label: '❌ Cancelar', value: 'cancel' }
        ], (choice)=>{
          if(choice === 'kb'){
            appendMessage('user', 'Ver base de conocimiento');
            hideOptions();
            appendMessage('bot', 'Puedes consultar toda nuestra base de conocimiento en Confluence:');
            appendMessage('bot', '🔗 <a href="https://redclay.atlassian.net/wiki/spaces/KMCELSIA/overview" target="_blank" style="color: #2563eb; text-decoration: underline;">Acceder a la Base de Conocimiento</a>');
            appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte?');
          }else if(choice === 'ticket'){
            appendMessage('user', 'Crear ticket');
            hideOptions();
            if(sistema) reportState.sistema = sistema;
            askForUserDetailsAndCreateTicket(query, []);
          }else{
            appendMessage('user', 'Cancelar');
            hideOptions();
            appendMessage('bot', 'Entendido. Si necesitas algo más, aquí estaré. 😊');
          }
        });
        return;
      }
      
      // Mostrar resultados de FAQs
      appendMessage('bot', `📚 Encontré ${results.length} ${results.length === 1 ? 'pregunta frecuente' : 'preguntas frecuentes'}:`);
      
      results.forEach((faq, i)=>{
        const faqDiv = document.createElement('div');
        faqDiv.style.cssText = 'margin:10px 0;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;';
        
        const preguntaDiv = document.createElement('div');
        preguntaDiv.style.cssText = 'font-weight:600;color:#92400e;font-size:15px;margin-bottom:6px;';
        preguntaDiv.textContent = '❓ ' + faq.pregunta;
        faqDiv.appendChild(preguntaDiv);
        
        const appDiv = document.createElement('div');
        appDiv.style.cssText = 'font-size:12px;color:#78350f;margin-bottom:8px;font-style:italic;';
        appDiv.textContent = '📱 Aplicación: ' + faq.aplicacion;
        faqDiv.appendChild(appDiv);
        
        const respuestaDiv = document.createElement('div');
        respuestaDiv.style.cssText = 'padding:10px;background:#fffbeb;border-radius:4px;border:1px solid #fde68a;font-size:14px;line-height:1.6;color:#451a03;';
        respuestaDiv.textContent = '✅ ' + faq.respuesta;
        faqDiv.appendChild(respuestaDiv);
        
        messagesEl.appendChild(faqDiv);
      });
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      // Preguntar si fue útil
      appendMessage('bot', '¿Esta información respondió tu pregunta?');
      showOptions([
        { label: '✅ Sí, resuelto', value: 'solved' },
        { label: '🔍 Buscar más información', value: 'more' },
        { label: '📋 Crear ticket', value: 'ticket' },
        { label: '❌ Finalizar', value: 'finish' }
      ], (choice)=>{
        if(choice === 'solved'){
          appendMessage('user', '¡Sí, resuelto!');
          appendMessage('bot', '¡Excelente! 🎉 Me alegra haber podido ayudarte con las preguntas frecuentes.');
          hideOptions();
          showFinalizarButton();
        }else if(choice === 'more'){
          appendMessage('user', 'Buscar más información');
          hideOptions();
          appendMessage('bot', '¿Quieres buscar otra pregunta frecuente o explorar la base de conocimiento completa?');
          showOptions([
            { label: 'Otra pregunta frecuente', value: 'faq' },
            { label: 'Base de conocimiento', value: 'kb' }
          ], (choice2)=>{
            if(choice2 === 'faq'){
              appendMessage('user', 'Otra pregunta frecuente');
              hideOptions();
              appendMessage('bot', '¿Qué otra pregunta tienes?');
            }else{
              appendMessage('user', 'Base de conocimiento');
              hideOptions();
              appendMessage('bot', 'Puedes consultar toda nuestra base de conocimiento en Confluence:');
              appendMessage('bot', '🔗 <a href="https://redclay.atlassian.net/wiki/spaces/KMCELSIA/overview" target="_blank" style="color: #2563eb; text-decoration: underline;">Acceder a la Base de Conocimiento</a>');
              appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte?');
            }
          });
        }else if(choice === 'ticket'){
          appendMessage('user', 'Crear ticket');
          hideOptions();
          if(sistema) reportState.sistema = sistema;
          askForUserDetailsAndCreateTicket(query, results);
        }else{
          appendMessage('user', 'Finalizar');
          hideOptions();
          appendMessage('bot', 'Gracias por consultar las preguntas frecuentes. ¡Hasta pronto! 😊');
          showFinalizarButton();
        }
      });
    })
    .catch(err => {
      appendMessage('bot', 'Hubo un error al buscar: ' + err.message);
    });
}

function goBack(){
  if(stateHistory.length === 0) return;
  
  const previousState = stateHistory.pop();
  reportState = previousState.reportState;
  
  hideOptions();
  appendMessage('bot', 'Volviendo al paso anterior...');
  
  // Ejecutar la acción para restaurar el estado anterior
  if(previousState.action){
    setTimeout(()=>{
      previousState.action();
    }, 300);
  }
}

function handleAdvisoryRequest(){
  stateHistory = []; // Limpiar historial
  reportState = { step: 'asesoria_sistema', sistema: null, modulo: null };
  appendMessage('bot', '¡Perfecto! Me encantaría asesorarte. 📚 ¿Sobre qué sistema necesitas asesoría?');
  
  showOptions([
    { label: 'C2M', value: 'C2M' },
    { label: 'FIELD', value: 'FIELD' },
    { label: 'SALES', value: 'SALES' },
    { label: 'SERVICE', value: 'SERVICE' }
  ], (sistema)=>{
    reportState.sistema = sistema;
    appendMessage('user', sistema);
    askForAdvisoryTopic(sistema);
  }, false);
}

function askForAdvisoryTopic(sistema){
  hideOptions();
  appendMessage('bot', `Excelente elección. ¿Sobre qué aspecto de ${sistema} te gustaría recibir asesoría? Por ejemplo:\n• Funcionalidades específicas\n• Procesos o flujos de trabajo\n• Configuraciones\n• Mejores prácticas\n• Reportes\n\nEscribe el tema que te interesa:`);
  
  // Crear input para el tema de asesoría
  const inputDiv = document.createElement('div');
  inputDiv.className = 'advisory-input-container';
  inputDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
  
  const textarea = document.createElement('textarea');
  textarea.placeholder = `Ej: Cómo crear órdenes de trabajo, configurar tarifas, etc...`;
  textarea.style.cssText = 'flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;';
  textarea.rows = 2;
  
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Buscar información';
  submitBtn.style.cssText = 'padding:8px 12px;background:#3b82f6;border:none;color:#fff;border-radius:6px;cursor:pointer;';
  
  submitBtn.addEventListener('click', ()=>{
    const topic = textarea.value.trim();
    if(!topic || topic.length < 5){
      alert('Por favor, describe el tema con al menos 5 caracteres.');
      return;
    }
    const sanitized = topic.replace(/<script|<\/script|on\w+\s*=/gi, '');
    appendMessage('user', 'Tema: ' + sanitized);
    messagesEl.parentElement.removeChild(inputDiv);
    searchAdvisoryInKnowledgeBase(sistema, sanitized);
  });
  
  inputDiv.appendChild(textarea);
  inputDiv.appendChild(submitBtn);
  messagesEl.parentElement.insertBefore(inputDiv, messagesEl.nextSibling);
  textarea.focus();
}

function searchAdvisoryInKnowledgeBase(sistema, topic){
  const searchQuery = `${sistema} ${topic}`;
  
  appendMessage('bot', `🔍 Buscando información sobre "${topic}" en ${sistema}...`);
  
  fetch('/api/confluence/search-knowledge?q=' + encodeURIComponent(searchQuery))
    .then(r=>r.json())
    .then(data=>{
      if(data.error){
        appendMessage('bot', 'No pude conectar con la base de conocimiento. ¿Te gustaría que un especialista te contacte para asesorarte?');
        showOptions([
          { label: '✅ Sí, contactar especialista', value: 'yes' },
          { label: '🔄 Intentar otro tema', value: 'retry' },
          { label: '❌ Cancelar', value: 'no' }
        ], (choice)=>{
          if(choice === 'yes'){
            appendMessage('user', 'Sí, contactar especialista');
            hideOptions();
            askForUserDetailsForAdvisory(sistema, topic);
          }else if(choice === 'retry'){
            appendMessage('user', 'Intentar otro tema');
            hideOptions();
            askForAdvisoryTopic(sistema);
          }else{
            appendMessage('user', 'Cancelar');
            hideOptions();
            appendMessage('bot', 'Entendido. Si cambias de opinión, aquí estaré para ayudarte. 😊');
          }
        });
        return;
      }
      
      const results = data.results || [];
      
      if(results.length === 0){
        appendMessage('bot', `No encontré documentación específica sobre "${topic}" en ${sistema}. ¿Qué te gustaría hacer?`);
        showOptions([
          { label: '📧 Contactar especialista', value: 'contact' },
          { label: '🔄 Buscar otro tema', value: 'retry' },
          { label: '📋 Crear ticket de consulta', value: 'ticket' },
          { label: '❌ Cancelar', value: 'cancel' }
        ], (choice)=>{
          if(choice === 'contact'){
            appendMessage('user', 'Contactar especialista');
            hideOptions();
            askForUserDetailsForAdvisory(sistema, topic);
          }else if(choice === 'retry'){
            appendMessage('user', 'Buscar otro tema');
            hideOptions();
            askForAdvisoryTopic(sistema);
          }else if(choice === 'ticket'){
            appendMessage('user', 'Crear ticket de consulta');
            hideOptions();
            reportState.sistema = sistema;
            askForUserDetailsAndCreateTicket(`Asesoría sobre: ${topic}`, []);
          }else{
            appendMessage('user', 'Cancelar');
            hideOptions();
            appendMessage('bot', 'Sin problema. Si necesitas asesoría más tarde, no dudes en contactarme. 😊');
          }
        });
        return;
      }
      
      // Mostrar resultados de asesoría
      appendMessage('bot', `📚 Encontré ${results.length} ${results.length === 1 ? 'recurso' : 'recursos'} sobre "${topic}" en ${sistema}:`);
      
      results.forEach((result, i)=>{
        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = 'margin:8px 0;padding:12px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;';
        
        const titleLink = document.createElement('a');
        titleLink.href = result.url;
        titleLink.target = '_blank';
        titleLink.style.cssText = 'color:#1e40af;text-decoration:underline;font-weight:600;font-size:15px;';
        titleLink.textContent = result.title;
        resultDiv.appendChild(titleLink);
        
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'margin-top:8px;padding:10px;background:#fff;border-radius:4px;border:1px solid #dbeafe;font-size:14px;line-height:1.6;';
        contentDiv.textContent = result.solucion;
        contentDiv.style.color = '#1e3a8a';
        resultDiv.appendChild(contentDiv);
        
        messagesEl.appendChild(resultDiv);
      });
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      // Preguntar si la información fue útil
      appendMessage('bot', '¿Esta información te fue útil? ¿Necesitas algo más?');
      showOptions([
        { label: '✅ Sí, muy útil', value: 'useful' },
        { label: '🔍 Buscar otro tema', value: 'another' },
        { label: '📧 Contactar especialista', value: 'contact' },
        { label: '❌ Finalizar', value: 'finish' }
      ], (choice)=>{
        if(choice === 'useful'){
          appendMessage('user', '¡Sí, muy útil!');
          appendMessage('bot', '¡Excelente! 🎉 Me alegra haber podido ayudarte con la asesoría sobre ${sistema}. Si tienes más consultas, aquí estaré.');
          hideOptions();
          showFinalizarButton();
        }else if(choice === 'another'){
          appendMessage('user', 'Buscar otro tema');
          hideOptions();
          appendMessage('bot', 'Perfecto. ¿Quieres buscar otro tema en ${sistema} o cambiar de sistema?');
          showOptions([
            { label: `Otro tema en ${sistema}`, value: 'same' },
            { label: 'Cambiar de sistema', value: 'change' }
          ], (choice2)=>{
            if(choice2 === 'same'){
              appendMessage('user', `Otro tema en ${sistema}`);
              hideOptions();
              askForAdvisoryTopic(sistema);
            }else{
              appendMessage('user', 'Cambiar de sistema');
              hideOptions();
              handleAdvisoryRequest();
            }
          });
        }else if(choice === 'contact'){
          appendMessage('user', 'Contactar especialista');
          hideOptions();
          askForUserDetailsForAdvisory(sistema, topic);
        }else{
          appendMessage('user', 'Finalizar');
          hideOptions();
          appendMessage('bot', 'Gracias por usar el servicio de asesoría. ¡Hasta pronto! 😊');
          showFinalizarButton();
        }
      });
    })
    .catch(err=>{
      appendMessage('bot', 'Hubo un error al buscar: ' + err.message);
      showOptions([
        { label: '🔄 Intentar de nuevo', value: 'retry' },
        { label: '📧 Contactar especialista', value: 'contact' }
      ], (choice)=>{
        if(choice === 'retry'){
          appendMessage('user', 'Intentar de nuevo');
          hideOptions();
          searchAdvisoryInKnowledgeBase(sistema, topic);
        }else{
          appendMessage('user', 'Contactar especialista');
          hideOptions();
          askForUserDetailsForAdvisory(sistema, topic);
        }
      });
    });
}

function askForUserDetailsForAdvisory(sistema, topic){
  appendMessage('bot', 'Perfecto. Un especialista te contactará para asesorarte sobre este tema. Por favor, proporciona tus datos:');
  
  const nombre = prompt('Por favor, ingresa tu nombre:');
  if(!nombre) return;
  
  const apellido = prompt('Por favor, ingresa tu apellido:');
  if(!apellido) return;
  
  const correo = prompt('Por favor, ingresa tu correo electrónico:');
  if(!correo) return;
  
  appendMessage('user', `${nombre} ${apellido} - ${correo}`);
  
  const ticketData = {
    searchQuery: `Solicitud de asesoría: ${topic}`,
    sistema: sistema,
    modulo: null,
    results: [],
    nombre: nombre,
    apellido: apellido,
    correo: correo,
    descripcion: `El usuario solicita asesoría sobre: ${topic} en el sistema ${sistema}`
  };
  
  fetch('/api/jira/create-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketData)
  })
  .then(r => r.json())
  .then(data => {
    if(data.success) {
      lastJiraTicket = data.ticketKey;
      appendMessage('bot', `✅ Listo. Tu solicitud de asesoría ha sido registrada como ${data.ticketKey}. Un especialista en ${sistema} se pondrá en contacto contigo pronto.`);
      showFinalizarButton();
    } else {
      appendMessage('bot', 'Hubo un error al crear la solicitud. Por favor, intenta nuevamente.');
    }
  })
  .catch(err => {
    appendMessage('bot', 'Hubo un error al crear la solicitud. Por favor, intenta nuevamente.');
  });
}

function handleReportIncident(){
  stateHistory = []; // Limpiar historial al iniciar nuevo reporte
  reportState = { step: 'sistema', sistema: null, modulo: null };
  appendMessage('bot', 'Selecciona el sistema donde se presentó la incidencia:');
  
  showOptions([
    { label: 'C2M', value: 'C2M' },
    { label: 'FIELD', value: 'FIELD' },
    { label: 'SALES', value: 'SALES' },
    { label: 'SERVICE', value: 'SERVICE' },
    { label: 'OTRO', value: 'OTRO' }
  ], (sistema)=>{
    reportState.sistema = sistema;
    appendMessage('user', sistema);
    
    if(sistema === 'C2M'){
      showC2MModules();
    }else{
      // Para FIELD, SALES, SERVICE y OTRO también pedir descripción del error
      hideOptions();
      appendMessage('bot', `Perfecto. Ahora describe el error o problema que tienes en ${sistema}:`);
      askForErrorDescription();
    }
  }, false); // No mostrar volver en la primera pantalla
}

function showC2MModules(){
  // Guardar estado anterior para poder volver
  stateHistory.push({
    reportState: { step: 'sistema', sistema: null, modulo: null },
    action: handleReportIncident
  });
  
  reportState.step = 'modulo';
  appendMessage('bot', 'Selecciona el módulo dentro de C2M:');
  showOptions([
    { label: 'Actividades de campo', value: 'actividades_campo' },
    { label: 'Ventas', value: 'ventas' },
    { label: 'Facturación', value: 'facturacion' },
    { label: 'Reportes', value: 'reportes' },
    { label: 'Otro', value: 'otro' }
  ], (modulo)=>{
    reportState.modulo = modulo;
    appendMessage('user', modulo);
    
    // Guardar estado para poder volver a módulos
    stateHistory.push({
      reportState: { step: 'modulo', sistema: 'C2M', modulo: null },
      action: showC2MModules
    });
    
    if(modulo === 'actividades_campo'){
      hideOptions();
      appendMessage('bot', 'Perfecto. Ahora comparte el error que se presenta:');
      askForErrorDescription();
    }else{
      finishIncidentReport();
    }
  });
}

function finishIncidentReport(){
  hideOptions();
  const summary = 'Incidencia en ' + reportState.sistema + (reportState.modulo ? ' - Módulo: ' + reportState.modulo : '');
  appendMessage('bot', 'Gracias por reportar. Tu incidencia "' + summary + '" ha sido registrada. ¿Hay algo más?');
  reportState = { step: null, sistema: null, modulo: null };
}

function askForErrorDescription(){
  // Create a custom input container for error description
  const inputDiv = document.createElement('div');
  inputDiv.className = 'error-input-container';
  inputDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
  
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Describe el error que presentas (mínimo 10 caracteres)...';
  textarea.style.cssText = 'flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;';
  textarea.rows = 2;
  
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Buscar solución';
  submitBtn.style.cssText = 'padding:8px 12px;background:#10b981;border:none;color:#fff;border-radius:6px;cursor:pointer;';
  
  submitBtn.addEventListener('click', ()=>{
    const errorText = textarea.value.trim();
    // Validation: minimum 10 characters
    if(!errorText || errorText.length < 10){
      alert('Por favor, describe el error con al menos 10 caracteres.');
      return;
    }
    // Sanitize input (remove potential script tags)
    const sanitized = errorText.replace(/<script|<\/script|on\w+\s*=/gi, '');
    appendMessage('user', 'Error: ' + sanitized);
    messagesEl.parentElement.removeChild(inputDiv);
    searchKnowledgeBase(sanitized);
  });
  
  inputDiv.appendChild(textarea);
  inputDiv.appendChild(submitBtn);
  messagesEl.parentElement.insertBefore(inputDiv, messagesEl.nextSibling);
  textarea.focus();
}

function askForUserDetailsAndCreateTicket(searchQuery, results){
  // Pedir nombre
  const nombreInput = prompt('Por favor, ingresa tu nombre:');
  if(!nombreInput) return;
  
  // Pedir apellido
  const apellidoInput = prompt('Por favor, ingresa tu apellido:');
  if(!apellidoInput) return;
  
  // Pedir correo
  const correoInput = prompt('Por favor, ingresa tu correo electrónico:');
  if(!correoInput) return;
  
  // Pedir descripción de la situación
  appendMessage('bot', 'Ahora, por favor describe la situación que presenta:');
  const descDiv = document.createElement('div');
  descDiv.style.cssText = 'margin:8px 0;padding:10px;';
  
  const descTextarea = document.createElement('textarea');
  descTextarea.placeholder = 'Describe tu situación aquí...';
  descTextarea.style.cssText = 'width:100%;height:100px;padding:8px;border:1px solid #ddd;border-radius:4px;font-family:Arial;font-size:14px;';
  
  const descSubmitBtn = document.createElement('button');
  descSubmitBtn.textContent = 'Enviar y Crear Ticket';
  descSubmitBtn.style.cssText = 'margin-top:8px;padding:8px 16px;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;width:100%;';
  
  descSubmitBtn.addEventListener('click', ()=>{
    const descripcion = descTextarea.value.trim();
    if(!descripcion){
      alert('Por favor, describe la situación.');
      return;
    }
    
    appendMessage('user', `Descripción: ${descripcion}`);
    descDiv.remove();
    
    // Crear ticket con toda la información
    createSearchTicketWithUserDetails(searchQuery, results, nombreInput, apellidoInput, correoInput, descripcion);
  });
  
  descDiv.appendChild(descTextarea);
  descDiv.appendChild(descSubmitBtn);
  messagesEl.parentElement.insertBefore(descDiv, messagesEl.nextSibling);
  descTextarea.focus();
}

function createSearchTicket(searchQuery, results){
  const ticketData = {
    searchQuery: searchQuery,
    sistema: reportState.sistema || 'General',
    modulo: reportState.modulo || null,
    results: results
  };
  
  fetch('/api/jira/create-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketData)
  })
  .then(r => r.json())
  .then(data => {
    if(data.success) {
      lastJiraTicket = data.ticketKey; // Guardar el código del ticket
      console.log('Ticket creado en Jira:', data.ticketKey);
    } else {
      console.error('Error creando ticket:', data.error);
    }
  })
  .catch(err => console.error('Error creating ticket:', err));
}

function createSearchTicketWithUserDetails(searchQuery, results, nombre, apellido, correo, descripcion){
  const ticketData = {
    searchQuery: searchQuery,
    sistema: reportState.sistema || 'General',
    modulo: reportState.modulo || null,
    results: results,
    nombre: nombre,
    apellido: apellido,
    correo: correo,
    descripcion: descripcion
  };
  
  fetch('/api/jira/create-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketData)
  })
  .then(r => r.json())
  .then(data => {
    if(data.success) {
      lastJiraTicket = data.ticketKey;
      console.log('Ticket creado en Jira con datos de usuario:', data.ticketKey);
      const ticketMsg = `Listo. Tu solicitud ha sido registrada como ${data.ticketKey}. Un agente se pondrá en contacto pronto.`;
      appendMessage('bot', ticketMsg);
      showFinalizarButton();
    } else {
      console.error('Error creando ticket:', data.error);
      appendMessage('bot', 'Hubo un error al crear el ticket. Por favor, intenta nuevamente.');
    }
  })
  .catch(err => {
    console.error('Error creating ticket:', err);
    appendMessage('bot', 'Hubo un error al crear el ticket. Por favor, intenta nuevamente.');
  });
}

function searchKnowledgeBaseForProblem(searchTerm, sistema){
  fetch('/api/confluence/search-knowledge?q=' + encodeURIComponent(searchTerm))
    .then(r=>r.json())
    .then(data=>{
      if(data.error){
        appendMessage('bot', 'No se pudo conectar con la base de conocimiento. ¿Deseas que creemos un ticket para que un agente te ayude?');
        showOptions([
          { label: 'Sí, crear ticket', value: 'yes' },
          { label: 'No, gracias', value: 'no' }
        ], (choice)=>{
          if(choice === 'yes'){
            appendMessage('user', 'Sí, crear ticket');
            hideOptions();
            handleReportIncident();
          }else{
            appendMessage('user', 'No, gracias');
            appendMessage('bot', 'Entendido. Si necesitas ayuda más tarde, aquí estaré. 😊');
            hideOptions();
          }
        });
        return;
      }
      
      const results = data.results || [];
      
      if(results.length === 0){
        const sistemaMsg = sistema ? ` en ${sistema}` : '';
        appendMessage('bot', `No encontré artículos específicos${sistemaMsg} para tu problema. ¿Te gustaría:`);
        showOptions([
          { label: '📋 Crear un ticket', value: 'ticket' },
          { label: '🔍 Describir más el problema', value: 'describe' },
          { label: '❌ Cancelar', value: 'cancel' }
        ], (choice)=>{
          if(choice === 'ticket'){
            appendMessage('user', 'Crear un ticket');
            hideOptions();
            handleReportIncident();
          }else if(choice === 'describe'){
            appendMessage('user', 'Describir más el problema');
            appendMessage('bot', 'Por favor, cuéntame con más detalle qué está sucediendo. Incluye:\n• ¿Qué estabas intentando hacer?\n• ¿Qué mensaje de error ves?\n• ¿Cuándo empezó el problema?');
            hideOptions();
          }else{
            appendMessage('user', 'Cancelar');
            appendMessage('bot', 'Entendido. Si necesitas ayuda, no dudes en escribirme. 😊');
            hideOptions();
          }
        });
        return;
      }
      
      // Mostrar resultados encontrados
      appendMessage('bot', `Encontré ${results.length} ${results.length === 1 ? 'solución relacionada' : 'soluciones relacionadas'}:`);
      
      results.forEach((result, i)=>{
        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = 'margin:8px 0;padding:10px;background:#f0fdf4;border-left:4px solid #10b981;border-radius:4px;';
        
        const titleLink = document.createElement('a');
        titleLink.href = result.url;
        titleLink.target = '_blank';
        titleLink.style.cssText = 'color:#0b3b59;text-decoration:underline;font-weight:600;';
        titleLink.textContent = result.title;
        resultDiv.appendChild(titleLink);
        
        const solucionDiv = document.createElement('div');
        solucionDiv.style.cssText = 'margin-top:8px;padding:10px;background:#fff;border-radius:4px;border:1px solid #d1fae5;font-size:15px;line-height:1.5;';
        solucionDiv.textContent = result.solucion;
        solucionDiv.style.color = '#065f46';
        resultDiv.appendChild(solucionDiv);
        
        messagesEl.appendChild(resultDiv);
      });
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      // Preguntar si las soluciones ayudaron
      appendMessage('bot', '¿Alguna de estas soluciones te ayudó?');
      showOptions([
        { label: '✅ Sí, resuelto', value: 'solved' },
        { label: '📋 No, crear ticket', value: 'ticket' },
        { label: '🔍 Necesito más ayuda', value: 'more' }
      ], (choice)=>{
        if(choice === 'solved'){
          appendMessage('user', '¡Sí, está resuelto!');
          appendMessage('bot', '¡Excelente! 🎉 Me alegra mucho haber podido ayudarte. Si tienes más consultas, aquí estaré.');
          hideOptions();
          showFinalizarButton();
        }else if(choice === 'ticket'){
          appendMessage('user', 'No, crear ticket');
          hideOptions();
          appendMessage('bot', 'Entendido. Vamos a crear un ticket para que un especialista te ayude.');
          setTimeout(()=>{
            askForUserDetailsAndCreateTicket(searchTerm, results);
          }, 500);
        }else{
          appendMessage('user', 'Necesito más ayuda');
          appendMessage('bot', 'Sin problema. Puedes:\n• Describirme el problema con más detalle\n• Crear un ticket para un especialista\n• Contactar directamente a un agente\n\n¿Qué prefieres?');
          hideOptions();
        }
      });
    })
    .catch(err=>{
      appendMessage('bot', 'Hubo un error al buscar: ' + err.message + '. ¿Deseas crear un ticket?');
      showOptions([
        { label: 'Sí, crear ticket', value: 'yes' },
        { label: 'No, gracias', value: 'no' }
      ], (choice)=>{
        if(choice === 'yes'){
          appendMessage('user', 'Sí, crear ticket');
          hideOptions();
          handleReportIncident();
        }else{
          appendMessage('user', 'No, gracias');
          hideOptions();
        }
      });
    });
}

function searchKnowledgeBase(errorText){
  // Construir consulta de búsqueda más específica incluyendo sistema y módulo
  let searchQuery = errorText;
  
  // Agregar contexto del sistema para búsquedas más precisas
  if(reportState.sistema){
    searchQuery = `${reportState.sistema} ${searchQuery}`;
  }
  if(reportState.modulo){
    searchQuery = `${searchQuery} ${reportState.modulo}`;
  }
  
  appendMessage('bot', `Buscando soluciones para "${errorText}" en ${reportState.sistema || 'la base de conocimiento'}...`);
  
  fetch('/api/confluence/search-knowledge?q=' + encodeURIComponent(searchQuery))
    .then(r=>r.json())
    .then(data=>{
      if(data.error){
        appendMessage('bot', 'No se pudo conectar con la base de conocimiento. Por favor, describe el error al agente.');
        showContactAgentButton();
        return;
      }
      const results = data.results || [];
      
      if(results.length === 0){
        appendMessage('bot', 'No encontramos artículos relacionados. ¿Deseas que creemos un ticket para que un agente te ayude?');
        showOptions([
          { label: 'Sí, crear ticket', value: 'yes' },
          { label: 'No, gracias', value: 'no' }
        ], (choice)=>{
          if(choice === 'yes'){
            appendMessage('user', 'Sí, crear ticket');
            hideOptions();
            askForUserDetailsAndCreateTicket(errorText, []);
          }else{
            appendMessage('user', 'No, gracias');
            appendMessage('bot', 'Entendido. Gracias por usar nuestro servicio de soporte. ¡Hasta pronto!');
            hideOptions();
            showFinalizarButton();
          }
        });
        return;
      }
      
      // Show results with solutions
      appendMessage('bot', 'Encontramos la siguiente información:');
      
      results.forEach((result, i)=>{
        // Create result container with title and solution
        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = 'margin:8px 0;padding:10px;background:#f0fdf4;border-left:4px solid #10b981;border-radius:4px;';
        
        const titleLink = document.createElement('a');
        titleLink.href = result.url;
        titleLink.target = '_blank';
        titleLink.style.cssText = 'color:#0b3b59;text-decoration:underline;font-weight:600;';
        titleLink.textContent = result.title;
        resultDiv.appendChild(titleLink);
        
        // Show the solution prominently
        const solucionDiv = document.createElement('div');
        solucionDiv.style.cssText = 'margin-top:8px;padding:10px;background:#fff;border-radius:4px;border:1px solid #d1fae5;font-size:15px;line-height:1.5;';
        solucionDiv.textContent = result.solucion;
        solucionDiv.style.color = '#065f46';
        resultDiv.appendChild(solucionDiv);
        
        messagesEl.appendChild(resultDiv);
      });
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      // Ask if user found the solution
      appendMessage('bot', '¿Pudiste encontrar lo que buscabas?');
      showOptions([
        { label: 'Sí, encontré la solución', value: 'yes' },
        { label: 'No, necesito más ayuda', value: 'no' }
      ], (choice)=>{
        if(choice === 'yes'){
          appendMessage('user', 'Sí, encontré la solución');
          appendMessage('bot', '¡Excelente! Me alegra haber podido ayudarte. Si vuelves a necesitar soporte, aquí estaré. ¡Hasta pronto!');
          hideOptions();
          showFinalizarButton();
        }else{
          appendMessage('user', 'No, necesito más ayuda');
          appendMessage('bot', 'Entendido. ¿Deseas que creemos un ticket para que un agente especializado te ayude?');
          showOptions([
            { label: 'Sí, crear ticket', value: 'yes_ticket' },
            { label: 'No, gracias', value: 'no_ticket' }
          ], (choice2)=>{
            if(choice2 === 'yes_ticket'){
              appendMessage('user', 'Sí, crear ticket');
              hideOptions();
              askForUserDetailsAndCreateTicket(errorText, results);
            }else{
              appendMessage('user', 'No, gracias');
              const finalMsg = lastJiraTicket
                ? `Entendido. Gracias por usar nuestro servicio de soporte. Tu código de seguimiento es: ${lastJiraTicket}. ¡Hasta pronto!`
                : 'Entendido. Gracias por usar nuestro servicio de soporte. ¡Hasta pronto!';
              appendMessage('bot', finalMsg);
              hideOptions();
              showFinalizarButton();
            }
          });
        }
      });
    })
    .catch(err=>{
      appendMessage('bot', 'Error al buscar: ' + err.message);
      showContactAgentButton();
    });
}

function showFinalizarButton(){
  const containerDiv = document.createElement('div');
  containerDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
  
  const finalizarBtn = document.createElement('button');
  finalizarBtn.textContent = 'Finalizar sesión';
  finalizarBtn.style.cssText = 'padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;flex:1;';
  finalizarBtn.addEventListener('click', ()=>{
    const finalMsg = lastJiraTicket
      ? `Sesión finalizada. Tu código de seguimiento es: ${lastJiraTicket}. ¡Gracias por usar nuestro servicio!`
      : 'Sesión finalizada. ¡Gracias por usar nuestro servicio!';
    appendMessage('bot', finalMsg);
    containerDiv.remove();
    lastJiraTicket = null; // Reset para nueva sesión
    setTimeout(()=>location.reload(), 2000); // Reiniciar en 2 segundos
  });
  
  containerDiv.appendChild(finalizarBtn);
  messagesEl.parentElement.appendChild(containerDiv);
}

function showContactAgentButton(){
  const containerDiv = document.createElement('div');
  containerDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
  
  const contactBtn = document.createElement('button');
  contactBtn.textContent = 'Contactar con un agente';
  contactBtn.style.cssText = 'flex:1;padding:10px;background:#f59e0b;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;';
  
  contactBtn.addEventListener('click', ()=>{
    messagesEl.parentElement.removeChild(containerDiv);
    appendMessage('user', 'Deseo contactar con un agente');
    appendMessage('bot', 'Perfecto. Un agente se pondrá en contacto contigo en breve. ¿Cuál es tu correo electrónico o número de teléfono?');
    askForContactInfo();
  });
  
  containerDiv.appendChild(contactBtn);
  messagesEl.parentElement.insertBefore(containerDiv, messagesEl.nextSibling);
}

function askForContactInfo(){
  const inputDiv = document.createElement('div');
  inputDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Correo o teléfono (ej: usuario@mail.com o +34 666 777 888)';
  input.style.cssText = 'flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;';
  
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Enviar';
  submitBtn.style.cssText = 'padding:8px 12px;background:#3b82f6;border:none;color:#fff;border-radius:6px;cursor:pointer;';
  
  submitBtn.addEventListener('click', ()=>{
    const contactInfo = input.value.trim();
    if(!contactInfo || contactInfo.length < 5){
      alert('Por favor, proporciona un correo o teléfono válido.');
      return;
    }
    appendMessage('user', contactInfo);
    messagesEl.parentElement.removeChild(inputDiv);
    submitAgentContact(contactInfo);
  });
  
  inputDiv.appendChild(input);
  inputDiv.appendChild(submitBtn);
  messagesEl.parentElement.insertBefore(inputDiv, messagesEl.nextSibling);
  input.focus();
}

function submitAgentContact(contactInfo){
  appendMessage('bot', 'Gracias por proporcionarnos tu información. Un agente se pondrá en contacto contigo a través de ' + contactInfo + ' en los próximos 30 minutos. ¿Hay algo más en lo que podamos ayudarte?');
  // Optionally, send this data to the backend
  fetch('/api/contact-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactInfo, sistema: reportState.sistema, modulo: reportState.modulo })
  }).catch(err=>console.log('Contact info sent or error:', err));
}

function botReply(userText){
  const txt = userText.toLowerCase();
  
  // Saludos básicos
  if(/^(hola|buenas|hi|hey|buenos días|buenas tardes|buenas noches)$/i.test(txt)) {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? '¡Buenos días!' : hora < 18 ? '¡Buenas tardes!' : '¡Buenas noches!';
    return `${saludo} Soy tu asistente para soporte técnico de Oracle Utilities. Puedo ayudarte con:\n\n• 🔍 Buscar respuestas en nuestra base de conocimiento\n• 📊 Analizar datos y generar reportes\n• 🎫 Crear tickets de soporte\n• 💬 Conectarte con un agente\n\n¿En qué puedo ayudarte hoy?`;
  }
  
  if(/^(gracias|muchas gracias|thank you|thanks)$/i.test(txt)) {
    return '¡De nada! Estoy aquí para ayudarte. Si necesitas algo más, no dudes en preguntar. 😊';
  }
  
  if(/^(adiós|adios|bye|hasta luego|nos vemos)$/i.test(txt)) {
    return '¡Hasta luego! Que tengas un excelente día. Si necesitas ayuda en el futuro, aquí estaré. 👋';
  }
  
  // Si menciona sistema pero no es pregunta específica, buscar en FAQs
  if(/c2m|field|sales|service/.test(txt) && txt.length > 10){
    return 'Veo que mencionas uno de nuestros sistemas. ¿Tienes una pregunta específica? Puedo buscar en nuestra base de conocimiento o analizar datos para ayudarte mejor.';
  }
  
  // Respuesta por defecto: ofrecer opciones en lugar de información genérica
  return 'Entiendo tu consulta. Para ayudarte mejor, puedo:\n\n🔍 Buscar información específica en nuestra base de conocimiento\n📊 Analizar datos si tienes una consulta sobre reportes\n🎫 Crear un ticket para que un especialista te ayude\n💬 Conectarte directamente con un agente\n\n¿Cuál prefieres o puedes darme más detalles de lo que necesitas?';
}

// ============================================
// FUNCIONES DE ANÁLISIS DE DATOS
// ============================================

function autoAnalyzeDataQuery(question){
  appendMessage('bot', '🔍 Analizando los datos para responder tu pregunta...');
  
  // Obtener el primer archivo Excel disponible
  fetch('/api/data/list-files')
    .then(r => r.json())
    .then(data => {
      if(data.error || !data.files || data.files.length === 0){
        appendMessage('bot', '⚠️ No hay archivos Excel disponibles para analizar. Por favor, sube un archivo a la carpeta "data".');
        return;
      }
      
      const fileName = data.files[0].name;
      appendMessage('bot', `📂 Usando archivo: ${fileName}`);
      
      // Analizar el archivo con datos completos
      fetch(`/api/data/analyze?file=${encodeURIComponent(fileName)}&fullData=true`)
        .then(r => r.json())
        .then(data => {
          if(data.error){
            appendMessage('bot', '⚠️ Error al analizar: ' + data.error);
            return;
          }
          
          const stats = data.stats;
          const allData = data.allData || [];
          
          // Intentar responder la pregunta con filtros
          const answer = interpretDataQueryWithFiltering(question, stats, allData, fileName);
          appendMessage('bot', answer);
          
          // Ofrecer más opciones
          showOptions([
            { label: '📊 Ver estadísticas completas', value: 'full_stats' },
            { label: '🔄 Hacer otra consulta', value: 'another' },
            { label: '✅ Finalizar', value: 'done' }
          ], (choice)=>{
            if(choice === 'full_stats'){
              appendMessage('user', 'Ver estadísticas completas');
              hideOptions();
              analyzeExcelFile(fileName);
            }else if(choice === 'another'){
              appendMessage('user', 'Hacer otra consulta');
              hideOptions();
              appendMessage('bot', 'Claro, ¿qué más quieres saber sobre los datos?');
            }else{
              appendMessage('user', 'Finalizar');
              hideOptions();
              appendMessage('bot', '¡Gracias por usar el análisis de datos! ¿Hay algo más en lo que pueda ayudarte?');
            }
          });
        })
        .catch(err => {
          console.error('Error:', err);
          appendMessage('bot', '❌ Error al analizar el archivo.');
        });
    })
    .catch(err => {
      console.error('Error:', err);
      appendMessage('bot', '❌ Error al conectar con el servidor.');
    });
}

function interpretDataQueryWithFiltering(question, stats, allData, fileName){
  const txt = question.toLowerCase();
  let response = `📊 <strong>Análisis basado en ${fileName}</strong>\n\n`;
  
  // Detectar rango de fechas en español
  const dateMatch = txt.match(/(\d{1,2}).*?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*?(\d{1,2}).*?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*?(\d{4})?/i);
  
  let filteredData = allData;
  let startDate, endDate;
  
  if(dateMatch){
    const months = {
      'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
      'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
    };
    
    const startDay = parseInt(dateMatch[1]);
    const startMonth = months[dateMatch[2].toLowerCase()];
    const endDay = parseInt(dateMatch[3]);
    const endMonth = months[dateMatch[4].toLowerCase()];
    const year = parseInt(dateMatch[5] || '2026');
    
    startDate = new Date(year, startMonth - 1, startDay);
    endDate = new Date(year, endMonth - 1, endDay, 23, 59, 59);
    
    response += `🗓️ <strong>Rango solicitado:</strong> ${startDay} de ${dateMatch[2]} al ${endDay} de ${dateMatch[4]} de ${year}\n\n`;
    
    // Buscar columna de fecha
    const dateColumn = stats.columns.find(col => 
      /fecha|date|día|dia|timestamp|time|creado|created|hora/i.test(col)
    );
    
    if(dateColumn && allData.length > 0){
      response += `📅 Filtrando por columna: <strong>${dateColumn}</strong>\n\n`;
      
      filteredData = allData.filter(row => {
        const cellValue = row[dateColumn];
        if(!cellValue) return false;
        
        // Intentar parsear diferentes formatos de fecha
        let rowDate;
        if(typeof cellValue === 'number'){ // Excel serial date
          rowDate = excelDateToJSDate(cellValue);
        }else{
          rowDate = new Date(cellValue);
        }
        
        return rowDate >= startDate && rowDate <= endDate;
      });
      
      response += `✅ <strong>Registros encontrados:</strong> ${filteredData.length} casos\n\n`;
      
      if(filteredData.length > 0){
        response += `📈 <strong>Detalles:</strong>\n`;
        response += `• Fecha inicio: ${startDate.toLocaleDateString('es-ES')}\n`;
        response += `• Fecha fin: ${endDate.toLocaleDateString('es-ES')}\n`;
        response += `• Total de casos: <strong>${filteredData.length}</strong>\n`;
      }else{
        response += `⚠️ No se encontraron registros en ese rango de fechas.`;
      }
    }else{
      response += `⚠️ No se pudo identificar una columna de fecha en el archivo.\n`;
      response += `📋 Columnas disponibles:\n${stats.columns.slice(0, 5).join(', ')}...\n\n`;
      response += `📝 Total de registros en el archivo completo: <strong>${allData.length}</strong>`;
    }
  }else{
    // Sin filtro de fecha, mostrar total
    response += `📝 Total de registros en el archivo: <strong>${allData.length}</strong>\n\n`;
    
    if(/casos|registros|cantidad/.test(txt)){
      response += `ℹ️ El archivo contiene <strong>${allData.length} registros</strong> en total.\n\n`;
    }
    
    response += `💡 <strong>Tip:</strong> Puedes preguntar por rangos de fechas específicas, por ejemplo:\n`;
    response += `"¿Cuántos casos del 1 de enero al 15 de enero de 2026?"`;
  }
  
  return response;
}

// Función auxiliar para convertir fechas seriales de Excel a JavaScript Date
function excelDateToJSDate(serial){
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

function interpretDataQuery(question, stats, fileName){
  const txt = question.toLowerCase();
  let response = `📊 <strong>Análisis basado en ${fileName}</strong>\n\n`;
  
  // Detectar rango de fechas
  const dateMatch = txt.match(/(\d{1,2}).*?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*?(\d{1,2}).*?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*?(\d{4})?/i);
  
  if(dateMatch){
    const startDay = dateMatch[1];
    const startMonth = dateMatch[2];
    const endDay = dateMatch[3];
    const endMonth = dateMatch[4];
    const year = dateMatch[5] || '2026';
    
    response += `🗓️ Rango solicitado: ${startDay} de ${startMonth} al ${endDay} de ${endMonth} de ${year}\n\n`;
  }
  
  // Información general del archivo
  response += `📝 Total de registros en el archivo: <strong>${stats.totalRows}</strong>\n\n`;
  
  // Detectar qué información se solicita
  if(/casos|registros|cantidad|número/.test(txt)){
    response += `ℹ️ El archivo contiene <strong>${stats.totalRows} registros</strong> en total.\n\n`;
  }
  
  // Mostrar columnas disponibles
  response += `📋 <strong>Columnas disponibles:</strong>\n`;
  response += stats.columns.slice(0, 10).map((col, i) => `${i+1}. ${col}`).join('\n');
  if(stats.columns.length > 10){
    response += `\n... y ${stats.columns.length - 10} columnas más`;
  }
  response += `\n\n`;
  
  // Buscar columna de fecha
  const dateColumn = stats.columns.find(col => 
    /fecha|date|día|dia|timestamp|time|creado|created/i.test(col)
  );
  
  if(dateColumn){
    response += `📅 Columna de fecha identificada: <strong>${dateColumn}</strong>\n`;
    const dateStats = stats.columnStats[dateColumn];
    response += `   • Registros con fecha: ${dateStats.count}\n`;
    response += `   • Fechas únicas: ${dateStats.unique}\n\n`;
  }else{
    response += `⚠️ No se identificó automáticamente una columna de fecha. Columnas disponibles:\n`;
    response += stats.columns.filter(col => /fecha|date|año|mes|day/i.test(col)).join(', ') || 'Ninguna columna con nombre relacionado a fechas';
    response += `\n\n`;
  }
  
  response += `💡 <strong>Nota:</strong> Para filtrar por fechas específicas, necesito que el archivo tenga una columna de fechas bien formateada. Puedo mostrarte las estadísticas completas si lo deseas.`;
  
  return response;
}

function handleDataAnalysisRequest(){
  appendMessage('bot', '📊 Puedo ayudarte a analizar datos de archivos Excel. ¿Qué te gustaría hacer?');
  
  showOptions([
    { label: '📈 Ver estadísticas generales', value: 'stats' },
    { label: '🔍 Consultar datos específicos', value: 'query' },
    { label: '📋 Listar archivos disponibles', value: 'list' },
    { label: '❌ Cancelar', value: 'cancel' }
  ], (choice)=>{
    if(choice === 'stats'){
      appendMessage('user', 'Ver estadísticas generales');
      hideOptions();
      listExcelFilesForAnalysis();
    }else if(choice === 'query'){
      appendMessage('user', 'Consultar datos específicos');
      hideOptions();
      appendMessage('bot', 'Esta funcionalidad estará disponible pronto. Por ahora puedes ver estadísticas generales.');
      listExcelFilesForAnalysis();
    }else if(choice === 'list'){
      appendMessage('user', 'Listar archivos disponibles');
      hideOptions();
      listExcelFilesForAnalysis();
    }else{
      appendMessage('user', 'Cancelar');
      hideOptions();
      appendMessage('bot', 'Entendido. ¿Hay algo más en lo que pueda ayudarte?');
    }
  });
}

function listExcelFilesForAnalysis(){
  appendMessage('bot', 'Buscando archivos Excel disponibles...');
  
  fetch('/api/data/list-files')
    .then(r => r.json())
    .then(data => {
      if(data.error){
        appendMessage('bot', '⚠️ Error al listar archivos: ' + data.error);
        return;
      }
      
      const files = data.files || [];
      
      if(files.length === 0){
        appendMessage('bot', '📂 No hay archivos Excel disponibles. Por favor, coloca archivos .xlsx o .xls en la carpeta "data" del servidor.');
        return;
      }
      
      appendMessage('bot', `📁 Archivos disponibles (${files.length}):\n\n${files.map((f, i) => `${i+1}. ${f.name} (${(f.size / 1024).toFixed(2)} KB)`).join('\n')}`);
      appendMessage('bot', 'Selecciona un archivo para analizar:');
      
      const options = files.map((f, i) => ({
        label: `${i+1}. ${f.name}`,
        value: f.name
      }));
      options.push({ label: '❌ Cancelar', value: 'cancel' });
      
      showOptions(options, (fileName)=>{
        if(fileName === 'cancel'){
          appendMessage('user', 'Cancelar');
          hideOptions();
          return;
        }
        
        appendMessage('user', fileName);
        hideOptions();
        analyzeExcelFile(fileName);
      });
    })
    .catch(err => {
      console.error('Error:', err);
      appendMessage('bot', '❌ Error al conectar con el servidor.');
    });
}

function analyzeExcelFile(fileName){
  appendMessage('bot', `Analizando archivo: ${fileName}...`);
  
  fetch(`/api/data/analyze?file=${encodeURIComponent(fileName)}`)
    .then(r => r.json())
    .then(data => {
      if(data.error){
        appendMessage('bot', '⚠️ Error al analizar: ' + data.error);
        return;
      }
      
      const stats = data.stats;
      
      // Mostrar estadísticas
      let message = `📊 <strong>Análisis de ${fileName}</strong>\n\n`;
      message += `📝 Total de registros: <strong>${stats.totalRows}</strong>\n`;
      message += `📋 Columnas: <strong>${stats.columns.length}</strong>\n\n`;
      message += `<strong>Estadísticas por columna:</strong>\n\n`;
      
      Object.keys(stats.columnStats).forEach(col => {
        const colStats = stats.columnStats[col];
        message += `🔹 <strong>${col}</strong>\n`;
        message += `   • Valores: ${colStats.count}\n`;
        message += `   • Únicos: ${colStats.unique}\n`;
        message += `   • Nulos: ${colStats.nullCount}\n`;
        
        if(colStats.isNumeric){
          message += `   • Suma: ${colStats.sum.toFixed(2)}\n`;
          message += `   • Promedio: ${colStats.avg.toFixed(2)}\n`;
          message += `   • Mínimo: ${colStats.min}\n`;
          message += `   • Máximo: ${colStats.max}\n`;
        }
        message += `\n`;
      });
      
      appendMessage('bot', message);
      
      // Mostrar muestra de datos
      if(data.sample && data.sample.length > 0){
        appendMessage('bot', '<strong>Muestra de datos (primeras 5 filas):</strong>');
        const table = createDataTable(data.sample);
        messagesEl.appendChild(table);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      
      appendMessage('bot', '¿Necesitas analizar otro archivo?');
      showOptions([
        { label: '🔄 Analizar otro archivo', value: 'yes' },
        { label: '✅ Finalizar', value: 'no' }
      ], (choice)=>{
        if(choice === 'yes'){
          appendMessage('user', 'Analizar otro archivo');
          hideOptions();
          listExcelFilesForAnalysis();
        }else{
          appendMessage('user', 'Finalizar');
          hideOptions();
          appendMessage('bot', '¡Gracias por usar el análisis de datos! ¿Hay algo más en lo que pueda ayudarte?');
        }
      });
    })
    .catch(err => {
      console.error('Error:', err);
      appendMessage('bot', '❌ Error al analizar el archivo.');
    });
}

function createDataTable(data){
  const tableDiv = document.createElement('div');
  tableDiv.style.cssText = 'overflow-x:auto;margin:10px 0;max-width:100%;';
  
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;font-size:12px;width:100%;background:white;';
  
  // Headers
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  Object.keys(data[0]).forEach(key => {
    const th = document.createElement('th');
    th.textContent = key;
    th.style.cssText = 'padding:8px;background:#8B0000;color:white;border:1px solid #ddd;text-align:left;font-weight:600;';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Body
  const tbody = document.createElement('tbody');
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.style.cssText = i % 2 === 0 ? 'background:#f9f9f9;' : 'background:white;';
    Object.values(row).forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      td.style.cssText = 'padding:6px 8px;border:1px solid #ddd;';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  
  tableDiv.appendChild(table);
  return tableDiv;
}

function simulateBot(userText){
  const txt = userText.toLowerCase();
  
  // PRIORIDAD 1: Detectar si el usuario quiere salir
  if(/^(salir|exit|cerrar|terminar|finalizar)$/i.test(txt)){
    hideOptions();
    currentOptions = [];
    
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      const finalMsg = lastJiraTicket
        ? `¡Gracias por usar nuestro servicio de soporte! Tu código de seguimiento es: ${lastJiraTicket}.\n\n✨ Esperamos verte pronto. ¡Hasta luego!`
        : '¡Gracias por usar nuestro servicio de soporte!\n\n✨ Esperamos verte pronto. ¡Hasta luego!';
      appendMessage('bot', finalMsg);
      
      // Mostrar botón para reiniciar
      setTimeout(()=>{
        const restartDiv = document.createElement('div');
        restartDiv.style.cssText = 'padding:10px 12px;text-align:center;';
        const restartBtn = document.createElement('button');
        restartBtn.textContent = '🔄 Nueva sesión';
        restartBtn.style.cssText = 'padding:10px 20px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;';
        restartBtn.addEventListener('click', ()=>location.reload());
        restartDiv.appendChild(restartBtn);
        messagesEl.parentElement.appendChild(restartDiv);
      }, 1000);
    }, 700);
    return;
  }
  
  // PRIORIDAD 1.5: Detectar solicitud de análisis de datos
  const isDataAnalysisRequest = /anali[sz]|estadística|estadistica|reporte|dashboard|métricas|metricas|datos.*excel|análisis.*datos|mostrar.*datos|consultar.*datos/.test(txt);
  const isDataQuery = /cuántos|cuantos|cuál.*total|cual.*total|suma.*de|promedio.*de|cantidad.*de|número.*de|numero.*de|casos.*reportados|registros.*de|fechas.*entre/.test(txt);
  
  if(isDataAnalysisRequest || isDataQuery){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      hideOptions();
      
      // Si es una pregunta específica, analizarla directamente
      if(isDataQuery){
        autoAnalyzeDataQuery(userText);
      }else{
        handleDataAnalysisRequest();
      }
    }, 700);
    return;
  }
  
  // PRIORIDAD 2: Detectar preguntas con signos de interrogación - BUSCAR EN FAQs PRIMERO
  const isQuestionMark = userText.includes('¿') || userText.includes('?');
  const mentionsTechnicalTerms = /c2m|field|sales|service|factura|medidor|orden|cliente|reporte|financiación|financiacion|dian|migra|cuenta|contrato|validar|corregir|reportar|configurar|crear|eliminar|actualizar/.test(txt);
  
  if(isQuestionMark && (mentionsTechnicalTerms || userText.length > 20)){
    // Es una pregunta con ? o ¿ y menciona términos técnicos - buscar en FAQs
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      
      // Detectar el sistema
      let sistema = null;
      if(/c2m/.test(txt)) sistema = 'C2M';
      else if(/field/.test(txt)) sistema = 'FIELD';
      else if(/sales|ventas/.test(txt)) sistema = 'SALES';
      else if(/service|servicio/.test(txt)) sistema = 'SERVICE';
      
      if(sistema) reportState.sistema = sistema;
      
      appendMessage('bot', `Déjame buscar esa información en nuestras preguntas frecuentes...`);
      searchInFAQs(userText, sistema);
    }, 700);
    return;
  }
  
  // PRIORIDAD 3: Detectar "tengo un problema" y buscar en la base de conocimiento primero
  const hasProblemPattern = /tengo.*problema|tengo.*error|tengo.*fallo|tengo.*issue|tengo.*dificultad|no puedo|no funciona|me sale.*error/.test(txt);
  
  if(hasProblemPattern){
    // Extraer el sistema mencionado si existe
    let sistema = null;
    let searchTerm = userText;
    
    if(/c2m|customer.*meter/.test(txt)) {
      sistema = 'C2M';
    } else if(/field|campo/.test(txt)) {
      sistema = 'FIELD';
    } else if(/sales|ventas/.test(txt)) {
      sistema = 'SALES';
    } else if(/service|servicio/.test(txt)) {
      sistema = 'SERVICE';
    }
    
    // Guardar el sistema en reportState para usar después si es necesario
    if(sistema) {
      reportState.sistema = sistema;
      searchTerm = `${sistema} ${userText}`;
    }
    
    // Mostrar typing indicator
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      const sistemaMsg = sistema ? ` con ${sistema}` : '';
      appendMessage('bot', `Entiendo que tienes un problema${sistemaMsg}. Déjame buscar soluciones en nuestra base de conocimiento...`);
      
      // Buscar en la base de conocimiento
      searchKnowledgeBaseForProblem(searchTerm, sistema);
    }, 700);
    return;
  }
  
  // Detectar solo "reportar incidencia" directo sin buscar en KB
  const shouldReportIncidentDirect = /reportar.*incidencia|crear.*ticket|abrir.*caso|nueva.*solicitud/.test(txt);
  
  if(shouldReportIncidentDirect){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      appendMessage('bot', 'Perfecto, vamos a crear un reporte de incidencia para ti.');
      hideOptions();
      handleReportIncident();
    }, 700);
    return;
  }
  
  // Detectar solicitud de asesoría
  const isAdvisoryRequest = /asesoría|asesoria|consulta|consultoria|consultoría|quiero aprender|necesito información|capacitación|capacitacion|tutorial|guía|guia|orientación|orientacion/.test(txt);
  
  if(isAdvisoryRequest){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      hideOptions();
      handleAdvisoryRequest();
    }, 700);
    return;
  }
  
  // Detectar preguntas sobre "cómo hacer algo" (sin signos de interrogación) y buscar automáticamente
  const isHowToQuestion = /cómo|como.*hacer|como.*crear|como.*configurar|como.*usar|como.*funciona|pasos.*para|proceso.*para/.test(txt);
  const mentionsSystems = /c2m|field|sales|service|factura|medidor|orden|cliente/.test(txt);
  
  if(isHowToQuestion && mentionsSystems){
    // El usuario pregunta "cómo hacer X en sistema Y" (sin ?) - buscar en FAQs
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      
      // Detectar el sistema
      let sistema = null;
      if(/c2m/.test(txt)) sistema = 'C2M';
      else if(/field/.test(txt)) sistema = 'FIELD';
      else if(/sales|ventas/.test(txt)) sistema = 'SALES';
      else if(/service|servicio/.test(txt)) sistema = 'SERVICE';
      
      if(sistema) reportState.sistema = sistema;
      
      appendMessage('bot', `Entiendo que quieres saber sobre eso. Primero revisaré las preguntas frecuentes...`);
      searchInFAQs(userText, sistema);
    }, 700);
    return;
  }
  
  // Detectar menciones específicas de temas técnicos (sin decir "tengo problema")
  const isTechnicalQuery = /factura|facturación|medidor|medidores|lectura|orden.*trabajo|instalación|configurar|sincronizar|integración|reporte|dashboard|cargo|pago|consumo|tarifa/.test(txt) &&
                           userText.length > 15; // Mínimo 15 caracteres para evitar palabras sueltas
  
  if(isTechnicalQuery && !/(hola|gracias|ayuda|salir)/i.test(txt)){
    // El usuario menciona un tema técnico específico - buscar en FAQs primero
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      
      // Detectar el sistema si se menciona
      let sistema = null;
      if(/c2m/.test(txt)) sistema = 'C2M';
      else if(/field/.test(txt)) sistema = 'FIELD';
      else if(/sales|ventas/.test(txt)) sistema = 'SALES';
      else if(/service|servicio/.test(txt)) sistema = 'SERVICE';
      
      if(sistema) reportState.sistema = sistema;
      
      appendMessage('bot', `Veo que preguntas sobre un tema específico. Primero verificaré en las preguntas frecuentes...`);
      searchInFAQs(userText, sistema);
    }, 700);
    return;
  }
  
  // show a typing indicator
  const typing = document.createElement('div');
  typing.className = 'message bot';
  typing.textContent = '...';
  typing.classList.add('typing');
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  setTimeout(()=>{
    messagesEl.removeChild(typing);
    appendMessage('bot', botReply(userText));
  }, 700 + Math.min(1200, userText.length * 40));
}

// handle suggestion button clicks (delegation)
const suggestionsEl = document.getElementById('suggestions');
if(suggestionsEl){
  suggestionsEl.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-text]');
    if(!btn) return;
    const text = btn.getAttribute('data-text');
    if(!text) return;
    // Check if this is the "report incident" button
    if(text.includes('Quiero reportar')) {
      hideOptions();
      handleReportIncident();
    }else{
      // simulate sending the suggested text
      appendMessage('user', text);
      simulateBot(text);
    }
  });
}

inputForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const text = messageInput.value.trim();
  if(!text) return;
  
  const txt = text.toLowerCase();
  
  // Detectar comandos especiales que siempre deben procesarse
  const isSpecialCommand = /^(salir|exit|cerrar|terminar|finalizar)$/i.test(text) ||
                          /reportar.*incidencia|quiero reportar|tengo.*problema|error.*sistema|error.*c2m|problema.*c2m|fallo.*c2m/.test(txt);
  
  // Si hay opciones activas pero el usuario escribe un comando especial, procesarlo
  if(currentOptions.length > 0 && isSpecialCommand){
    hideOptions();
    appendMessage('user', text);
    messageInput.value = '';
    simulateBot(text);
    return;
  }
  
  // Si hay opciones activas y NO es comando especial, sugerir pero permitir continuar
  if(currentOptions.length > 0){
    appendMessage('user', text);
    messageInput.value = '';
    // Procesar la respuesta del usuario para ver si responde a las opciones
    const processUserResponse = ()=>{
      // Detectar respuestas afirmativas o negativas
      if(/^(si|sí|yes|ok|dale|claro|afirmativo|crear ticket|quiero)$/i.test(txt)){
        // Simular clic en la primera opción afirmativa
        const yesBtn = Array.from(optionsContainer.querySelectorAll('button'))
          .find(btn => /sí|yes|crear/i.test(btn.textContent));
        if(yesBtn) {
          yesBtn.click();
          return true;
        }
      }
      if(/^(no|nop|nope|gracias|no gracias|cancelar)$/i.test(txt)){
        // Simular clic en la opción negativa
        const noBtn = Array.from(optionsContainer.querySelectorAll('button'))
          .find(btn => /no/i.test(btn.textContent) && !/volver/i.test(btn.textContent));
        if(noBtn) {
          noBtn.click();
          return true;
        }
      }
      return false;
    };
    
    // Intentar procesar como respuesta a opciones
    if(processUserResponse()){
      return;
    }
    
    // Si no es respuesta a opciones, procesarlo como conversación normal
    appendMessage('bot', 'Entiendo. Déjame ayudarte con eso...');
    simulateBot(text);
    return;
  }
  
  appendMessage('user', text);
  messageInput.value = '';
  simulateBot(text);
});

// initial greeting
window.addEventListener('load', ()=>{
  setTimeout(()=>appendMessage('bot','Bienvenido a tu Agente IA, ¿Que quieres hacer hoy?'),300);
});
