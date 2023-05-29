from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

# get version from __version__ variable in hoox/__init__.py
from hoox import __version__ as version

setup(
	name="hoox",
	version=version,
	description="An API Gateway to handle Tradingview Alerts and execute trades using ccxt.",
	author="jango_blockchained",
	author_email="info@cryptolinx.de",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
