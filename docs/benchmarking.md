# DropZone Benchmarking Guide

## Overview
DropZone includes a synthetic benchmark suite (TRD §12, FR-32) that measures data generation, chunking, framing, and transfer throughput across memory buffers without incurring disk I/O overhead.

Users can navigate to `/benchmark` to run tests and export benchmark runs as CSV records.

## Configuration Matrix
The suite evaluates data handling across multiple standard chunk sizes:
- **16 KiB** (baseline DataChannel chunk size)
- **32 KiB**
- **64 KiB**
- **128 KiB**
- **256 KiB** (supported on modern WebRTC engines)

Across sample synthetic payload sizes:
- 5 MB, 10 MB, 25 MB, 50 MB

## Metrics Recorded
1. **Chunk Size**: Chunk buffer size in bytes.
2. **Total Bytes**: Synthetic test bytes generated and framed.
3. **Duration (ms)**: Measured wall-clock time for the run.
4. **Throughput (Mbps)**: Effective processed throughput in megabits per second.
5. **RTT (ms)**: Round-trip time when run over an active WebRTC link.

## Network Emulation (tc netem)
To test under synthetic packet latency, jitter, or loss inside Docker or Linux environments:
```bash
# Add 50ms latency with 10ms jitter:
tc qdisc add dev eth0 root netem delay 50ms 10ms

# Add 2% packet loss:
tc qdisc change dev eth0 root netem loss 2%

# Limit bandwidth to 20 Mbps:
tc qdisc add dev eth0 root tbf rate 20mbit burst 32kbit latency 400ms
```
