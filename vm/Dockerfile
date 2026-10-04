# The in-browser lab machine: Alpine Linux (i386) for the v86 emulator.
# Built by .github/workflows/vm.yml; the browser boots it from a saved state (src/scripts/vm.ts).
FROM docker.io/i386/alpine:3.21.0
ENV KERNEL=virt
RUN apk add --no-cache openrc alpine-base agetty alpine-conf linux-$KERNEL linux-firmware-none \
      bash coreutils grep sed iptables iproute2 conntrack-tools curl socat python3 tcpdump procps less nodejs npm nginx
RUN sed -i 's/getty 38400 tty1/agetty --autologin root tty1 linux/' /etc/inittab \
 && echo 'ttyS0::respawn:/sbin/agetty --autologin root -s ttyS0 115200 vt100' >> /etc/inittab \
 && echo "root:" | chpasswd && setup-hostname lab
RUN for i in devfs dmesg mdev hwdrivers; do rc-update add $i sysinit; done \
 && for i in hwclock modules sysctl hostname syslog bootmisc; do rc-update add $i boot; done \
 && rc-update add killprocs shutdown \
 && printf 'auto lo\niface lo inet loopback\n' > /etc/network/interfaces && rc-update add networking boot
# netfilter and veth modules the labs use, loaded at boot so the saved state already has them
RUN printf '%s\n' veth nf_conntrack nf_nat nf_tables nft_compat nft_chain_nat xt_conntrack xt_nat xt_tcpudp xt_state iptable_filter iptable_nat iptable_raw >> /etc/modules
RUN mkinitfs -F "base virtio 9p" $(cat /usr/share/kernel/$KERNEL/kernel.release)
COPY vm/rootfs/ /
COPY public/labs/ /root/site/labs/
RUN chmod +x /usr/local/bin/* && find /root/site -name '*.sh' -exec chmod +x {} + \
 && cd /root/site/labs/llm-streaming && npm install --no-audit --no-fund --omit=dev && npm cache clean --force
