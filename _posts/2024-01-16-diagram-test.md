---
layout: post
title: "Diagram Test - Mermaid Compatibility Check"
date: 2024-01-16 10:00:00 +0000
categories: [Testing]
tags: [diagrams, mermaid, test]
author: Samadeep Sengupta
description: "Test post to verify Mermaid diagrams are working correctly"
---

# Diagram Test

This is a test post to verify that Mermaid diagrams are working correctly.

## Simple Flowchart

{% mermaid %}
graph TD
    A[Start] --> B[Process]
    B --> C[Decision]
    C -->|Yes| D[End]
    C -->|No| B
{% endmermaid %}

## Simple Sequence Diagram

{% mermaid %}
sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob
    B->>A: Hello Alice
{% endmermaid %}

## Test Results

If you can see the diagrams above, Mermaid is working correctly!

- ✅ Flowchart should show: Start → Process → Decision → End
- ✅ Sequence diagram should show: Alice ↔ Bob conversation
- ✅ Interactive buttons should appear on hover
- ✅ No JavaScript errors in console

## Performance Check

Open your browser's developer console (F12) and look for:
- `Mermaid diagram rendered in X.XXms`
- `All diagrams loaded in X.XXms. Total diagrams: 2`

---

*This test post can be deleted once diagrams are confirmed working.* 