document.addEventListener('DOMContentLoaded', function() {
  // Circuit state
  const state = {
    components: [],
    wires: [],
    selectedComponent: null,
    dragStart: null,
    wireStart: null,
    mode: 'component', // 'component' or 'wire'
    displayMode: 'component', // Added to track display mode
    autoWireMode: false, // Track if we should auto-enable wire mode
    nextId: 1,
    simulationResults: null,
    propertiesFor: null
  };

  // Component library
  const componentLibrary = [
    { type: 'resistor', name: 'Resistor', value: '1kΩ', symbol: '⏛' },
    { type: 'capacitor', name: 'Capacitor', value: '10μF', symbol: '⟨⟩' },
    { type: 'inductor', name: 'Inductor', value: '1mH', symbol: '⌇⌇⌇' },
    { type: 'voltage_source', name: 'Voltage Source', value: '5V', symbol: '⊕' },
    { type: 'current_source', name: 'Current Source', value: '1mA', symbol: '⟳' },
    { type: 'ground', name: 'Ground', value: 'GND', symbol: '⏚' },
    { type: 'diode', name: 'Diode', value: '1N4148', symbol: '◁▷' },
    { type: 'transistor', name: 'Transistor', value: '2N2222', symbol: '⊥' },
    { type: 'lightbulb', name: 'Light Bulb', value: '60W', symbol: '💡', state: 'off' },
    { type: 'switch', name: 'Switch', value: 'SW1', symbol: '⏣', state: 'open' }
  ];

  // DOM elements
  const canvas = document.getElementById('circuitCanvas');
  const componentButtons = document.getElementById('componentButtons');
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const runSimulationBtn = document.getElementById('runSimulation');
  const clearCircuitBtn = document.getElementById('clearCircuit');
  const saveCircuitBtn = document.getElementById('saveCircuit');
  const downloadPDFBtn = document.getElementById('downloadPDF');
  const loadCircuitInput = document.getElementById('loadCircuit');
  const componentActions = document.getElementById('componentActions');
  const rotateComponentBtn = document.getElementById('rotateComponent');
  const deleteComponentBtn = document.getElementById('deleteComponent');
  const simulationResults = document.getElementById('simulationResults');
  const propertiesDialog = document.getElementById('propertiesDialog');
  const propertiesTitle = document.getElementById('propertiesTitle');
  const componentValue = document.getElementById('componentValue');
  const closePropertiesBtn = document.getElementById('closeProperties');

  // Setup SVG canvas using D3
  const svg = d3.select('#circuitCanvas');

  // Create grid pattern
  const defs = svg.append('defs');
  const pattern = defs.append('pattern')
    .attr('id', 'grid')
    .attr('width', 20)
    .attr('height', 20)
    .attr('patternUnits', 'userSpaceOnUse');

  pattern.append('path')
    .attr('d', 'M 20 0 L 0 0 0 20')
    .attr('fill', 'none')
    .attr('stroke', 'gray')
    .attr('stroke-width', 0.5);

  // Add background grid
  svg.append('rect')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('fill', 'url(#grid)');

  // Create element groups
  const wiresGroup = svg.append('g').attr('class', 'wires');
  const componentsGroup = svg.append('g').attr('class', 'components');
  const tempWireGroup = svg.append('g').attr('class', 'temp-wire');

  // Initialize component buttons
  componentLibrary.forEach(comp => {
    const button = document.createElement('button');
    button.className = 'component-btn';
    button.innerHTML = `${comp.symbol} ${comp.name}`;
    button.title = comp.name;
    button.addEventListener('click', () => addComponent(comp.type));
    componentButtons.appendChild(button);
  });

  // Initialize mode selector
  modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.mode = e.target.value;
      state.displayMode = e.target.value;

      // Update cursor style based on mode
      updateCursorStyle();

      // Reset state when changing modes
      if (state.selectedComponent) {
        state.selectedComponent = null;
        updateComponentActions();
      }

      if (state.wireStart) {
        state.wireStart = null;
        renderTempWire();
      }
    });
  });

  // Set initial cursor style
  canvas.classList.add('component-mode');

  // Initialize action buttons
  runSimulationBtn.addEventListener('click', runSimulation);
  clearCircuitBtn.addEventListener('click', clearCircuit);
  saveCircuitBtn.addEventListener('click', saveCircuit);
  downloadPDFBtn.addEventListener('click', downloadPDF);
  loadCircuitInput.addEventListener('change', loadCircuit);
  closePropertiesBtn.addEventListener('click', () => {
    propertiesDialog.style.display = 'none';
    state.propertiesFor = null;
  });

  // Canvas event handlers
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', (e) => {
    // Only reset wire start if we clicked on the canvas itself, not on a port
    if (e.target === canvas && state.wireStart) {
      state.wireStart = null;
      renderTempWire();
    }

    state.selectedComponent = null;
    state.dragStart = null;
    updateComponentActions();
  });

  // Component value field event handler
  componentValue.addEventListener('input', updateComponentValue);

  // Functions
  function addComponent(type) {
    const component = componentLibrary.find(comp => comp.type === type);
    if (!component) return;

    // Calculate offset based on existing components to prevent overlapping
    const xOffset = 150;
    const yOffset = 100;

    // Default starting position
    let xPos = 150;
    let yPos = 150;

    // If we have components, offset from the last added component
    if (state.components.length > 0) {
      const lastComponent = state.components[state.components.length - 1];

      // Calculate new position - move right and wrap to new row if needed
      xPos = lastComponent.x + xOffset;
      yPos = lastComponent.y;

      // If we're going off the right side of the canvas, move to next row
      if (xPos > 700) {
        xPos = 150;
        yPos += yOffset;
      }

      // If we're going off the bottom, restart from top
      if (yPos > 500) {
        xPos = 150;
        yPos = 150;
      }
    }

    const newComponent = {
      id: `comp-${state.nextId}`,
      type: component.type,
      name: component.name,
      value: component.value,
      symbol: component.symbol,
      x: xPos,
      y: yPos,
      width: 60,
      height: 40,
      rotation: 0,
      ports: [
        { id: `port-${state.nextId}-1`, x: -30, y: 0, connected: false },
        { id: `port-${state.nextId}-2`, x: 30, y: 0, connected: false }
      ]
    };

    // Add additional port for transistors
    if (type === 'transistor') {
      newComponent.ports.push({ id: `port-${state.nextId}-3`, x: 0, y: 20, connected: false });
    }

    state.components.push(newComponent);
    state.nextId++;

    renderComponents();
  }

  function updateComponentPosition(id, dx, dy) {
    state.components = state.components.map(comp => {
      if (comp.id === id) {
        const newX = comp.x + dx;
        const newY = comp.y + dy;

        return { ...comp, x: newX, y: newY };
      }
      return comp;
    });

    // Update connected wires
    state.wires = state.wires.map(wire => {
      let updatedWire = { ...wire };

      if (wire.from.componentId === id) {
        const component = state.components.find(c => c.id === id);
        const port = component.ports.find(p => p.id === wire.from.portId);
        updatedWire.from = {
          ...wire.from,
          x: component.x + port.x,
          y: component.y + port.y
        };
      }

      if (wire.to.componentId === id) {
        const component = state.components.find(c => c.id === id);
        const port = component.ports.find(p => p.id === wire.to.portId);
        updatedWire.to = {
          ...wire.to,
          x: component.x + port.x,
          y: component.y + port.y
        };
      }

      return updatedWire;
    });

    renderWires();
    renderComponents();
  }

  function handleMouseDown(e, componentId, portId = null) {
    e.stopPropagation();

    if (portId) {
      // Always handle port interactions for wire connections, regardless of current mode
      const component = state.components.find(comp => comp.id === componentId);
      const port = component.ports.find(p => p.id === portId);

      state.wireStart = {
        componentId,
        portId,
        x: component.x + port.x,
        y: component.y + port.y
      };

      renderTempWire();
    }
    else if (state.mode === 'component' && !portId) {
      state.selectedComponent = componentId;
      updateComponentActions();

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      state.dragStart = { x, y };
    }
  }

  function handleMouseMove(e) {
    if (state.mode === 'component' && state.selectedComponent && state.dragStart) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const dx = x - state.dragStart.x;
      const dy = y - state.dragStart.y;

      updateComponentPosition(state.selectedComponent, dx, dy);

      state.dragStart = { x, y };
    }

    // Always render temporary wire if wire start exists, regardless of mode
    if (state.wireStart) {
      renderTempWire(e);
    }
  }

  function handlePortMouseUp(e, componentId, portId) {
    e.stopPropagation();

    if ((state.mode === 'wire' || state.autoWireMode) && state.wireStart) {
      // Don't connect a port to itself
      if (state.wireStart.componentId === componentId && state.wireStart.portId === portId) {
        state.wireStart = null;
        renderTempWire();
        return;
      }

      const endComponent = state.components.find(comp => comp.id === componentId);
      const endPort = endComponent.ports.find(p => p.id === portId);

      // Add new wire
      const newWire = {
        id: `wire-${state.nextId}`,
        from: state.wireStart,
        to: {
          componentId,
          portId,
          x: endComponent.x + endPort.x,
          y: endComponent.y + endPort.y
        }
      };

      state.wires.push(newWire);
      state.nextId++;

      state.wireStart = null;
      renderTempWire();
      renderWires();
    }
  }

  function handleComponentDoubleClick(e, component) {
    e.stopPropagation();
    openProperties(component);
  }

  function deleteComponent(id) {
    // Remove component
    state.components = state.components.filter(comp => comp.id !== id);

    // Remove connected wires
    state.wires = state.wires.filter(wire =>
      wire.from.componentId !== id && wire.to.componentId !== id
    );

    state.selectedComponent = null;
    updateComponentActions();

    renderComponents();
    renderWires();
  }

  function rotateComponent(id) {
    state.components = state.components.map(comp => {
      if (comp.id === id) {
        const newRotation = (comp.rotation + 90) % 360;

        // Rotate ports
        const updatedPorts = comp.ports.map(port => {
          const { x, y } = port;
          // Apply rotation matrix
          let newX, newY;

          if (newRotation === 90) {
            newX = -y;
            newY = x;
          } else if (newRotation === 180) {
            newX = -x;
            newY = -y;
          } else if (newRotation === 270) {
            newX = y;
            newY = -x;
          } else {
            newX = x;
            newY = y;
          }

          return { ...port, x: newX, y: newY };
        });

        return { ...comp, rotation: newRotation, ports: updatedPorts };
      }
      return comp;
    });

    // Update connected wires
    updateWiresAfterRotation(id);

    renderComponents();
    renderWires();
  }

  function updateWiresAfterRotation(componentId) {
    const component = state.components.find(comp => comp.id === componentId);

    state.wires = state.wires.map(wire => {
      let updatedWire = { ...wire };

      if (wire.from.componentId === componentId) {
        const port = component.ports.find(p => p.id === wire.from.portId);
        updatedWire.from = {
          ...wire.from,
          x: component.x + port.x,
          y: component.y + port.y
        };
      }

      if (wire.to.componentId === componentId) {
        const port = component.ports.find(p => p.id === wire.to.portId);
        updatedWire.to = {
          ...wire.to,
          x: component.x + port.x,
          y: component.y + port.y
        };
      }

      return updatedWire;
    });
  }

  function openProperties(component) {
    state.propertiesFor = component;

    propertiesTitle.textContent = `${component.name} Properties`;
    componentValue.value = component.value;

    propertiesDialog.style.display = 'flex';
  }

  function updateComponentValue() {
    if (!state.propertiesFor) return;

    const newValue = componentValue.value;
    state.propertiesFor.value = newValue;

    state.components = state.components.map(comp => {
      if (comp.id === state.propertiesFor.id) {
        return { ...comp, value: newValue };
      }
      return comp;
    });

    renderComponents();
  }

  function runSimulation() {
    // This is a simplified simulation for demonstration
    const results = {};

    // Count components by type
    const componentCounts = {};
    state.components.forEach(comp => {
      componentCounts[comp.type] = (componentCounts[comp.type] || 0) + 1;
    });

    // Count wires
    const wireCount = state.wires.length;

    // Check if circuit has power source
    const hasPower = state.components.some(comp =>
      comp.type === 'voltage_source' || comp.type === 'current_source'
    );

    // Check if circuit is grounded
    const hasGround = state.components.some(comp => comp.type === 'ground');

    // Simple checks
    results.summary = {
      componentCount: state.components.length,
      wireCount,
      hasPower,
      hasGround,
      isComplete: hasPower && wireCount > 0
    };

    // Add fake voltage/current values for demonstration
    results.nodes = [];
    state.components.forEach(comp => {
      if (comp.type === 'voltage_source') {
        results.nodes.push({
          id: comp.id,
          name: `Node at ${comp.name}`,
          voltage: parseFloat(comp.value) || 5,
          current: '0 A'
        });
      } else if (comp.type === 'resistor') {
        // Extract numeric value and unit
        const valueMatch = comp.value.match(/(\d+\.?\d*)([a-zA-Z]*Ω?)/);
        const value = valueMatch ? parseFloat(valueMatch[1]) : 1000;
        const unit = valueMatch ? valueMatch[2] : 'Ω';

        let resistance = value;
        if (unit.includes('k')) resistance *= 1000;
        if (unit.includes('M')) resistance *= 1000000;

        const voltage = results.nodes.length > 0 ? results.nodes[0].voltage : 5;
        const current = (voltage / resistance).toFixed(3);

        results.nodes.push({
          id: comp.id,
          name: `Node at ${comp.name}`,
          voltage: (voltage * 0.8).toFixed(2) + ' V',
          current: current + ' A'
        });
      } else {
        // Generic values for other components
        results.nodes.push({
          id: comp.id,
          name: `Node at ${comp.name}`,
          voltage: (Math.random() * 5).toFixed(2) + ' V',
          current: (Math.random() * 0.01).toFixed(4) + ' A'
        });
      }
    });

    state.simulationResults = results;
    renderSimulationResults();

    // Scroll to simulation results
  const simulationResultsElement = document.getElementById('simulationResults');
  if (simulationResultsElement) {
    simulationResultsElement.scrollIntoView({ behavior: 'smooth' });
  }
  }

  function clearCircuit() {
    state.components = [];
    state.wires = [];
    state.simulationResults = null;
    state.selectedComponent = null;

    updateComponentActions();
    renderComponents();
    renderWires();
    renderSimulationResults();
  }

  function saveCircuit() {
    const circuitData = {
      components: state.components,
      wires: state.wires,
      nextId: state.nextId
    };

    const blob = new Blob([JSON.stringify(circuitData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'circuit.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function loadCircuit(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const circuitData = JSON.parse(event.target.result);
        state.components = circuitData.components || [];
        state.wires = circuitData.wires || [];
        state.nextId = circuitData.nextId || state.nextId;

        renderComponents();
        renderWires();
      } catch (error) {
        console.error("Error loading circuit:", error);
        alert("Invalid circuit file");
      }
    };
    reader.readAsText(file);
  }

  function updateComponentActions() {
    if (!componentActions) {
      console.error('componentActions element not found');
      return;
    }

    if (state.selectedComponent) {
      componentActions.style.display = 'block';
    } else {
      componentActions.style.display = 'none';
    }
  }

  // Rendering functions
  function renderComponents() {
    // Clear existing components
    componentsGroup.selectAll('*').remove();

    // Create component groups
    const componentGroups = componentsGroup
      .selectAll('.component')
      .data(state.components, d => d.id)
      .enter()
      .append('g')
      .attr('class', 'component')
      .attr('transform', d => `translate(${d.x},${d.y}) rotate(${d.rotation})`)
      .on('mousedown', function(e, d) {
        handleMouseDown(e, d.id);
      })
      .on('dblclick', function(e, d) {
        handleComponentDoubleClick(e, d);
      })
      .style('cursor', 'move')
      .on('mouseover', function(e, d) {
        //Rudimentary hover detection - improve with collision detection
        if (state.displayMode !== 'component') {
          state.displayMode = 'component';
          updateCursorStyle();
        }
      })
      .on('mouseout', function() {
        if (state.displayMode !== 'wire') {
          state.displayMode = state.mode;
          updateCursorStyle();
        }
      });


    // Component body
    componentGroups
      .append('rect')
      .attr('x', d => -d.width / 2)
      .attr('y', d => -d.height / 2)
      .attr('width', d => d.width)
      .attr('height', d => d.height)
      .attr('fill', '#fff')
      .attr('stroke', d => d.id === state.selectedComponent ? '#f00' : '#000')
      .attr('stroke-width', 2)
      .attr('rx', 4);

    // Component symbol
    componentGroups
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 20)
      .attr('pointer-events', 'none')
      .text(d => d.symbol);

    // Component value
    componentGroups
      .append('text')
      .attr('y', d => d.height / 2 + 15)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('pointer-events', 'none')
      .text(d => d.value);

    // Connection ports
    state.components.forEach(component => {
      const group = componentsGroup.selectAll(`.component`).filter(d => d.id === component.id);

      component.ports.forEach(port => {
        const portGroup = group.append('g')
          .attr('transform', `translate(${port.x},${port.y})`)
          .style('cursor', 'pointer');

        portGroup.append('circle')
          .attr('r', 8)
          .attr('fill', state.wireStart && state.wireStart.portId === port.id ? '#f00' : '#444')
          .attr('stroke', '#000')
          .attr('stroke-width', 2)
          .attr('opacity', 0.8)
          .on('mousedown', function(e) {
            // Always handle wire connection on ports regardless of mode
            e.stopPropagation();
            // Temporarily set auto wire mode to true
            state.autoWireMode = true;
            handleMouseDown(e, component.id, port.id);
          })
          .on('mouseup', function(e) {
            // Always handle wire connections on ports
            handlePortMouseUp(e, component.id, port.id);
            // Reset auto wire mode after connection is made
            state.autoWireMode = false;
          })
          .on('mouseover', function() {
            d3.select(this)
              .attr('r', 10)
              .attr('fill', '#3b82f6')
              .attr('opacity', 1);
            // Always switch to wire display mode when hovering over a port
            if (state.displayMode !== 'wire') {
              state.displayMode = 'wire';
              updateCursorStyle();
            }
          })
          .on('mouseout', function() {
            d3.select(this)
              .attr('r', 8)
              .attr('fill', state.wireStart && state.wireStart.portId === port.id ? '#f00' : '#444')
              .attr('opacity', 0.8);
            if (!state.wireStart && state.displayMode !== 'component') {
              state.displayMode = state.mode;
              updateCursorStyle();
            }
          });
      });
    });
  }

  function renderWires() {
    // Clear existing wires
    wiresGroup.selectAll('*').remove();

    // Create wires
    state.wires.forEach(wire => {
      const { from, to } = wire;

      // Generate control points for a bezier curve
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const controlPoint1 = {
        x: from.x + dx * 0.5,
        y: from.y
      };
      const controlPoint2 = {
        x: to.x - dx * 0.5,
        y: to.y
      };

      // Add invisible wider path for easier selection
      wiresGroup.append('path')
        .attr('d', `M ${from.x} ${from.y} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${to.x} ${to.y}`)
        .attr('stroke', 'transparent')
        .attr('stroke-width', 10)
        .attr('fill', 'none')
        .style('cursor', 'pointer')
        .on('mouseover', function() {
          d3.select(this).style('cursor', 'crosshair');
        })
        .on('mouseout', function() {
          d3.select(this).style('cursor', 'pointer');
        });

      // Visible wire
      wiresGroup.append('path')
        .attr('d', `M ${from.x} ${from.y} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${to.x} ${to.y}`)
        .attr('stroke', '#000')
        .attr('stroke-width', 2)
        .attr('fill', 'none')
        .on('mouseover', function() {
          d3.select(this).attr('stroke', '#f00');
          d3.select(this).style('cursor', 'crosshair');
        })
        .on('mouseout', function() {
          d3.select(this).attr('stroke', '#000');
          d3.select(this).style('cursor', 'pointer');
        })
        .on('click', function() {
          deleteWire(wire.id);
        });
    });
  }

  function deleteWire(id) {
    state.wires = state.wires.filter(wire => wire.id !== id);
    renderWires();
  }

  function renderTempWire(e) {
    // Clear existing temporary wire
    tempWireGroup.selectAll('*').remove();

    if (!state.wireStart) {
      // Remove any highlighted port visual cues
      d3.selectAll('.component circle')
        .attr('r', 8)
        .attr('stroke', '#000')
        .attr('stroke-width', 2);
      return;
    }

    // Highlight all potential connection ports when drawing a wire
    // Do this regardless of the current mode - always highlight ports when drawing a wire
    d3.selectAll('.component circle')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', function() {
        // Don't highlight the starting port
        const portId = d3.select(this.parentNode).datum()?.id;
        return (portId && portId === state.wireStart.portId) ? 2 : 3;
      })
      .attr('stroke-dasharray', function() {
        const portId = d3.select(this.parentNode).datum()?.id;
        return (portId && portId === state.wireStart.portId) ? 'none' : '3,2';
      });

    let endX, endY;

    if (e) {
      const rect = canvas.getBoundingClientRect();
      endX = e.clientX - rect.left;
      endY = e.clientY - rect.top;
    } else {
      endX = state.wireStart.x;
      endY = state.wireStart.y;
    }

    // Generate control points for a bezier curve
    const dx = endX - state.wireStart.x;
    const dy = endY - state.wireStart.y;
    const controlPoint1 = {
      x: state.wireStart.x + dx * 0.5,
      y: state.wireStart.y
    };
    const controlPoint2 = {
      x: endX - dx * 0.5,
      y: endY
    };

    tempWireGroup.append('path')
      .attr('d', `M ${state.wireStart.x} ${state.wireStart.y} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${endX} ${endY}`)
      .attr('stroke', '#f00')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('fill', 'none');
  }

  function renderSimulationResults() {
    if (!state.simulationResults) {
      simulationResults.style.display = 'none';
      return;
    }

    simulationResults.style.display = 'block';
    simulationResults.innerHTML = '';

    // Create header
    const header = document.createElement('h2');
    header.textContent = 'Simulation Results';
    header.className = 'simulation-header';
    simulationResults.appendChild(header);

    // Circuit summary
    const summarySection = document.createElement('div');
    summarySection.className = 'simulation-summary';

    const summaryHeader = document.createElement('h3');
    summaryHeader.textContent = 'Circuit Summary';
    summaryHeader.className = 'simulation-header-small';
    summarySection.appendChild(summaryHeader);

    const summaryList = document.createElement('div');

    const summary = state.simulationResults.summary;

    summaryList.innerHTML = `
      Components: ${summary.componentCount}  |  Wires: ${summary.wireCount}  |  Power Source: ${summary.hasPower ? 'Yes' : 'No'}  |  Ground: ${summary.hasGround ? 'Yes' : 'No'}  |  Circuit Complete: ${summary.isComplete ? 'Yes' : 'No'}
    `;
    summaryList.className = 'simulation-summary-list';

    summarySection.appendChild(summaryList);
    simulationResults.appendChild(summarySection);

    // Node analysis
    const nodesSection = document.createElement('div');

    const nodesHeader = document.createElement('h3');
    nodesHeader.textContent = 'Node Analysis';
    nodesHeader.className = 'simulation-header-small';
    nodesSection.appendChild(nodesHeader);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'overflow-x-auto';

    const table = document.createElement('table');
    table.className = 'simulation-table';

    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Node</th>
        <th>Voltage</th>
        <th>Current</th>
      </tr>
    `;
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement('tbody');

    state.simulationResults.nodes.forEach(node => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${node.name}</td>
        <td>${node.voltage}</td>
        <td>${node.current}</td>
      `;
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    tableContainer.appendChild(table);
    nodesSection.appendChild(tableContainer);

    simulationResults.appendChild(nodesSection);
  }

  function updateCursorStyle() {
    canvas.classList.remove('component-mode');
    canvas.classList.remove('wire-mode');
    if (state.displayMode === 'component') {
      canvas.classList.add('component-mode');
    } else if (state.displayMode === 'wire') {
      canvas.classList.add('wire-mode');
    }
  }

  function downloadPDF() {
    runSimulation();

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');

      // Add title
      pdf.setFontSize(18);
      pdf.text('Electronic Circuit Design', 20, 20);

      // Add date
      pdf.setFontSize(10);
      const currentDate = new Date().toLocaleString();
      pdf.text(`Generated on: ${currentDate}`, 20, 30);

      // Add circuit information directly
      pdf.setFontSize(14);
      pdf.text('Circuit Diagram', 20, 40);

      // Use html2canvas to capture the SVG canvas
      console.log("Capturing SVG canvas...");
      html2canvas(document.querySelector('.canvas-container'), {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: true,
        onclone: function(clonedDoc) {
          console.log("Cloning the SVG for pdf capture.");
          const clonedSvg = clonedDoc.getElementById('circuitCanvas');
          const existingRect = clonedSvg.querySelector('rect[fill="url(#grid)"]');
          if (existingRect) {
            existingRect.setAttribute('fill', 'url(#grid)');
            existingRect.setAttribute('width', '100%');
            existingRect.setAttribute('height', '100%');
          }
        }
      }).then(canvas => {
        const imgWidth = 170;
        const imgHeight = canvas.height * imgWidth / canvas.width;

        try {
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 20, 45, imgWidth, imgHeight);
        } catch (e) {
          console.error('Failed to add image to PDF:', e);
          pdf.setFontSize(12);
          pdf.text('Circuit diagram could not be included', 20, 45);
        }

        // Add simulation results
        let yPosition = 45 + imgHeight + 10;

        // Summary section for PDF
        pdf.setFontSize(14);
        pdf.text('Simulation Results', 20, yPosition);
        yPosition += 10;

        // Check if results are present
        if (!state.simulationResults) {
          console.warn('No simulation results found to include in the PDF.');
        } else {
          const summary = state.simulationResults.summary;
          pdf.setFontSize(12);
          pdf.text(`Components: ${summary.componentCount}`, 25, yPosition);
          yPosition += 5;
          pdf.text(`Wires: ${summary.wireCount}`, 25, yPosition);
          yPosition += 5;
          pdf.text(`Power Source: ${summary.hasPower ? 'Yes' : 'No'}`, 25, yPosition);
          yPosition += 5;
          pdf.text(`Ground: ${summary.hasGround ? 'Yes' : 'No'}`, 25, yPosition);
          yPosition += 5;
          pdf.text(`Circuit Complete: ${summary.isComplete ? 'Yes' : 'No'}`, 25, yPosition);
		  yPosition += 10;

          // Add node analysis
        pdf.setFontSize(12);
        pdf.text('Node Analysis', 20, yPosition);
        yPosition += 10;

        // Create table with borders and styling
        const tableStartY = yPosition;
        const cellPadding = 3;
        const colWidths = [65, 40, 40];
        const rowHeight = 8;

        // Draw a light gray background grid for the entire table area
        const tableHeight = (state.simulationResults.nodes.length + 1) * rowHeight;
        const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
        pdf.setDrawColor(200, 200, 200);
        pdf.setFillColor(248, 248, 248);
        pdf.rect(25, yPosition - 5, tableWidth, tableHeight, 'F');

        // Draw grid lines
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.1);

        // Vertical grid lines
        for (let x = 25; x <= 25 + tableWidth; x += colWidths[0]) {
          pdf.line(x, yPosition - 5, x, yPosition - 5 + tableHeight);
        }
        for (let x = 25 + colWidths[0]; x <= 25 + tableWidth; x += colWidths[1]) {
          pdf.line(x, yPosition - 5, x, yPosition - 5 + tableHeight);
        }

        // Horizontal grid lines
        for (let y = yPosition - 5; y <= yPosition - 5 + tableHeight; y += rowHeight) {
          pdf.line(25, y, 25 + tableWidth, y);
        }

        // Reset line settings for table borders
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.2);

        // Table header with background
        pdf.setFillColor(240, 240, 240);
        pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'F');

        // Table header text
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.text('Node', 25 + cellPadding, yPosition);
        pdf.text('Voltage', 25 + colWidths[0] + cellPadding, yPosition);
        pdf.text('Current', 25 + colWidths[0] + colWidths[1] + cellPadding, yPosition);

        // Draw header border
        pdf.setDrawColor(0);
        pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'S');

        // Vertical lines for header
        pdf.line(25 + colWidths[0], yPosition - 5, 25 + colWidths[0], yPosition + rowHeight - 5);
        pdf.line(25 + colWidths[0] + colWidths[1], yPosition - 5, 25 + colWidths[0] + colWidths[1], yPosition + rowHeight - 5);

        yPosition += rowHeight;
        pdf.setFont(undefined, 'normal');

        // Table rows
        let rowCount = 0;
        state.simulationResults.nodes.forEach(node => {
          // Check if we need a new page
          if (yPosition > 270) {
            pdf.addPage();
            yPosition = 20;

            // Redraw table header on new page
            pdf.setFillColor(240, 240, 240);
            pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'F');

            pdf.setFontSize(10);
            pdf.setFont(undefined, 'bold');
            pdf.text('Node', 25 + cellPadding, yPosition);
            pdf.text('Voltage', 25 + colWidths[0] + cellPadding, yPosition);
            pdf.text('Current', 25 + colWidths[0] + colWidths[1] + cellPadding, yPosition);

            pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'S');
            pdf.line(25 + colWidths[0], yPosition - 5, 25 + colWidths[0], yPosition + rowHeight - 5);
            pdf.line(25 + colWidths[0] + colWidths[1], yPosition - 5, 25 + colWidths[0] + colWidths[1], yPosition + rowHeight - 5);

            yPosition += rowHeight;
            pdf.setFont(undefined, 'normal');
          }

          // Alternate row background color
          if (rowCount % 2 === 1) {
            pdf.setFillColor(250, 250, 250);
            pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'F');
          }

          // Row text
          pdf.text(node.name, 25 + cellPadding, yPosition);
          pdf.text(String(node.voltage), 25 + colWidths[0] + cellPadding, yPosition); // Convert to string
          pdf.text(String(node.current), 25 + colWidths[0] + colWidths[1] + cellPadding, yPosition); // Convert to string

          // Row border
          pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'S');

          // Vertical lines inside the row
          pdf.line(25 + colWidths[0], yPosition - 5, 25 + colWidths[0], yPosition + rowHeight - 5);
          pdf.line(25 + colWidths[0] + colWidths[1], yPosition - 5, 25 + colWidths[0] + colWidths[1], yPosition + rowHeight - 5);

          yPosition += rowHeight;
          rowCount++;
        });
        }

        // Save the PDF
        pdf.save('electronic_circuit.pdf');
        console.log("PDF saved successfully.");
      }).catch(err => {
        console.error('Error capturing circuit canvas:', err);
        generatePDFWithoutDiagram();
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      generatePDFWithoutDiagram();
    }
  }

  // Fallback method to generate PDF without circuit diagram
  function generatePDFWithoutDiagram() {
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');

      // Add title
      pdf.setFontSize(18);
      pdf.text('Electronic Circuit Design', 20, 20);

      // Add date
      pdf.setFontSize(10);
      const currentDate = new Date().toLocaleString();
      pdf.text(`Generated on: ${currentDate}`, 20, 30);

      // Add note about missing diagram
      pdf.setFontSize(12);
      pdf.text('Note: Circuit diagram could not be included', 20, 40);

      // Add simple text representation of circuit
      pdf.setFontSize(10);
      pdf.text(`Circuit contains ${state.components.length} components and ${state.wires.length} wires`, 20, 50);

      let componentList = '';
      state.components.forEach((comp, index) => {
        componentList += `${index + 1}. ${comp.name} (${comp.value})`;
        if (index < state.components.length - 1) componentList += ', ';
      });

      // Add component list with text wrapping
      const textLines = pdf.splitTextToSize(componentList, 170);
      pdf.text(textLines, 20, 60);

      // Determine start position for simulation results based on text height
      let yPosition = 65 + textLines.length * 5;

      // Add simulation results if available
      if (state.simulationResults) {
        // Add summary section
        pdf.setFontSize(14);
        pdf.text('Simulation Results', 20, yPosition);
        yPosition += 10;

        pdf.setFontSize(12);
        pdf.text('Circuit Summary', 20, yPosition);
        yPosition += 7;

        pdf.setFontSize(10);
        const summary = state.simulationResults.summary;
        pdf.text(`Components: ${summary.componentCount}`, 25, yPosition);
        yPosition += 5;
        pdf.text(`Wires: ${summary.wireCount}`, 25, yPosition);
        yPosition += 5;
        pdf.text(`Power Source: ${summary.hasPower ? 'Yes' : 'No'}`, 25, yPosition);
        yPosition += 5;
        pdf.text(`Ground: ${summary.hasGround ? 'Yes' : 'No'}`, 25, yPosition);
        yPosition += 5;
        pdf.text(`Circuit Complete: ${summary.isComplete ? 'Yes' : 'No'}`, 25, yPosition);
        yPosition += 10;

        // Add node analysis
        pdf.setFontSize(12);
        pdf.text('Node Analysis', 20, yPosition);
        yPosition += 10;

        // Create table with borders and styling
        const tableStartY = yPosition;
        const cellPadding = 3;
        const colWidths = [65, 40, 40];
        const rowHeight = 8;

        // Draw a light gray background grid for the entire table area
        const tableHeight = (state.simulationResults.nodes.length + 1) * rowHeight;
        const tableWidth = colWidths.reduce((sum, width) => sum + width, 0);
        pdf.setDrawColor(200, 200, 200);
        pdf.setFillColor(248, 248, 248);
        pdf.rect(25, yPosition - 5, tableWidth, tableHeight, 'F');

        // Draw grid lines
        pdf.setDrawColor(220, 220, 220);
        pdf.setLineWidth(0.1);

        // Vertical grid lines
        for (let x = 25; x <= 25 + tableWidth; x += colWidths[0]) {
          pdf.line(x, yPosition - 5, x, yPosition - 5 + tableHeight);
        }
        for (let x = 25 + colWidths[0]; x <= 25 + tableWidth; x += colWidths[1]) {
          pdf.line(x, yPosition - 5, x, yPosition - 5 + tableHeight);
        }

        // Horizontal grid lines
        for (let y = yPosition - 5; y <= yPosition - 5 + tableHeight; y += rowHeight) {
          pdf.line(25, y, 25 + tableWidth, y);
        }

        // Reset line settings for table borders
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.2);

        // Table header with background
        pdf.setFillColor(240, 240, 240);
        pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'F');

        // Table header text
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.text('Node', 25 + cellPadding, yPosition);
        pdf.text('Voltage', 25 + colWidths[0] + cellPadding, yPosition);
        pdf.text('Current', 25 + colWidths[0] + colWidths[1] + cellPadding, yPosition);

        // Draw header border
        pdf.setDrawColor(0);
        pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'S');

        // Vertical lines for header
        pdf.line(25 + colWidths[0], yPosition - 5, 25 + colWidths[0], yPosition + rowHeight - 5);
        pdf.line(25 + colWidths[0] + colWidths[1], yPosition - 5, 25 + colWidths[0] + colWidths[1], yPosition + rowHeight - 5);

        yPosition += rowHeight;
        pdf.setFont(undefined, 'normal');

        // Table rows
        let rowCount = 0;
        state.simulationResults.nodes.forEach(node => {
          // Check if we need a new page
          if (yPosition > 270) {
            pdf.addPage();
            yPosition = 20;

            // Redraw table header on new page
            pdf.setFillColor(240, 240, 240);
            pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'F');

            pdf.setFontSize(10);
            pdf.setFont(undefined, 'bold');
            pdf.text('Node', 25 + cellPadding, yPosition);
            pdf.text('Voltage', 25 + colWidths[0] + cellPadding, yPosition);
            pdf.text('Current', 25 + colWidths[0] + colWidths[1] + cellPadding, yPosition);

            pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'S');
            pdf.line(25 + colWidths[0], yPosition - 5, 25 + colWidths[0], yPosition + rowHeight - 5);
            pdf.line(25 + colWidths[0] + colWidths[1], yPosition - 5, 25 + colWidths[0] + colWidths[1], yPosition + rowHeight - 5);

            yPosition += rowHeight;
            pdf.setFont(undefined, 'normal');
          }

          // Alternate row background color
          if (rowCount % 2 === 1) {
            pdf.setFillColor(250, 250, 250);
            pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'F');
          }

          // Row text
          pdf.text(node.name, 25 + cellPadding, yPosition);
          pdf.text(node.voltage, 25 + colWidths[0] + cellPadding, yPosition);
          pdf.text(node.current, 25 + colWidths[0] + colWidths[1] + cellPadding, yPosition);

          // Row border
          pdf.rect(25, yPosition - 5, tableWidth, rowHeight, 'S');

          // Vertical lines inside the row
          pdf.line(25 + colWidths[0], yPosition - 5, 25 + colWidths[0], yPosition + rowHeight - 5);
          pdf.line(25 + colWidths[0] + colWidths[1], yPosition - 5, 25 + colWidths[0] + colWidths[1], yPosition + rowHeight - 5);

          yPosition += rowHeight;
          rowCount++;
        });
      }

      // Save the PDF
      pdf.save('electronic_circuit.pdf');
    } catch (error) {
      console.error('Fallback PDF generation failed:', error);
      alert('Could not generate PDF. Please try again later.');
    }
  }

  // Initial render
  renderComponents();
  renderWires();
  updateComponentActions();
});