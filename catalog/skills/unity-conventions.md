---
# Auto-generado por init-claude
name: unity-conventions
description: Convenciones Unity/C#. Usar al crear o modificar MonoBehaviours y sistemas Unity.
---
Lifecycle: Awake=refs propias, OnEnable=suscripciones (OnDisable simetrico SIEMPRE), Start=refs externas, Update=solo frame-rate, FixedUpdate=fisica, LateUpdate=camara.
Serializacion: [SerializeField] private sobre public. Nunca refs a escena desde prefabs. ScriptableObjects para config compartida.
Performance: cachea GetComponent/Find en Awake (NUNCA en Update), object pooling para instanciacion frecuente, evita concatenacion de strings en hot paths.
Arquitectura: eventos para desacoplar, un MonoBehaviour = un comportamiento, logica testeable en clases puras C#.
Kiosk/Totem: timeout de inactividad con reset a estado inicial, manejo de perdida de foco, logs persistentes a archivo (no solo Debug.Log).
