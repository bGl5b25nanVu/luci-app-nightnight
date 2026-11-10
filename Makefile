include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-nightnight
PKG_VERSION:=0.6.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=liyongjun <yongjun.y.li@gmail.com>

LUCI_TITLE:=LuCI NightNight DPI Traffic & Privacy Audit Plugin
LUCI_DEPENDS:=+luci-base +ucode +ucode-mod-fs +ucode-mod-socket +ucode-mod-uloop +netifyd +conntrack
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
